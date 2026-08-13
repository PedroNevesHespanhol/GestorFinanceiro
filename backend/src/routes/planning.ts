import { Router, Request, Response, NextFunction } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { query } from 'express-validator';
import { validate } from '../middleware/validation';
import {
  collections,
  TransactionDoc,
  FixedExpenseDoc,
  RecurringIncomeDoc,
  AccountDoc,
  PluggyItemDoc,
} from '../services/firestore';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// No leading \b: issuers glue the counter to the text ("SAMSUNG NO ITAUSAO03/21").
const INSTALLMENT_RE = /(\d{1,2})\s*\/\s*(\d{1,2})\b/i;

// Matches installment counters in the formats issuers actually use:
// "3/12", "03 / 12", "Parcela 3/12", "Parcela 3 de 12", "LOJA03/21" (glued).
const INSTALLMENT_TOKEN_RE = /(?:\bparcela\s*)?\d{1,2}\s*(?:\/|\bde\b)\s*\d{1,2}\b/gi;

type InstallmentSource = 'regex' | 'metadata';

function extractInstallment(tx: TransactionDoc): {
  curr: number | null;
  total: number | null;
  source: InstallmentSource | null;
} {
  // Metadata is authoritative (comes straight from the issuer via Pluggy);
  // the description regex can misread dates like "05/07" as an installment.
  const meta = tx.creditCardMetadata;
  if (meta?.installmentNumber && meta?.totalInstallments && meta.totalInstallments > 1) {
    return { curr: meta.installmentNumber, total: meta.totalInstallments, source: 'metadata' };
  }
  const match = INSTALLMENT_RE.exec(tx.description ?? '');
  if (match) {
    const curr = parseInt(match[1], 10);
    const total = parseInt(match[2], 10);
    if (total > 1) {
      return { curr, total, source: 'regex' };
    }
  }
  return { curr: null, total: null, source: null };
}

function stripInstallmentTokens(desc: string): string {
  return desc.replace(INSTALLMENT_TOKEN_RE, ' ').replace(/\s{2,}/g, ' ').trim();
}

// Case/punctuation-insensitive description, with installment tokens stripped so
// every installment of the same purchase normalizes the same way even when the
// counter lives in the description (e.g. "Loja Parcela 3 de 12", "LOJA03/21").
function normalizeDescription(desc: string): string {
  return stripInstallmentTokens(desc)
    .toLowerCase()
    .replace(/[()*\-.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Issuers truncate merchant names differently per installment
// ("MERCADOLIVRE*LOJA" vs "MERCADOLIVRE*LOJASDULAR") — treat one normalized
// description being a prefix of the other as the same merchant.
function sameMerchant(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 5 && long.startsWith(short);
}

export interface InstallmentEntry {
  description: string;
  amount: number;
  installmentCurrent: number;
  installmentTotal: number;
  isProjected: boolean;
}

export interface MonthPlan {
  month: number;
  year: number;
  isPast: boolean;
  isCurrent: boolean;
  receitas: number;
  despesasVariaveis: number;
  despesasFixas: number;
  receitasRecorrentes: number;
  parceladas: InstallmentEntry[];
  totalParceladas: number;
  saldo: number;
}

export interface MonthCell {
  amount: number;
  isProjected: boolean;
}

export interface ExpenseGridRow {
  id: string;
  description: string;
  category: string;
  paymentMethod: string | null;
  kind: 'FIXED' | 'INSTALLMENT' | 'ONE_OFF';
  installmentTotal?: number;
  date?: string;
  totalAmount: number;
  monthlyCells: (MonthCell | null)[];
}

// Resolves a human-readable payment method for a row: the raw Pluggy
// paymentData (PIX/TED/DOC — present on bank-transfer transactions) takes
// priority; otherwise fall back to the connector name of the account the
// transaction was debited from (same account → pluggyItem join used by
// GET /accounts).
function resolvePaymentMethod(
  tx: TransactionDoc,
  accountMap: Map<string, AccountDoc>,
  itemMap: Map<string, PluggyItemDoc>
): string | null {
  const raw = tx.paymentData?.paymentMethod;
  if (raw) {
    return raw.toUpperCase().includes('PIX') ? 'Pix' : raw;
  }
  const account = accountMap.get(tx.accountId);
  const item = account ? itemMap.get(account.pluggyItemId) : undefined;
  return item?.connectorName ?? null;
}

function recurrenceAmount(
  doc: FixedExpenseDoc | RecurringIncomeDoc,
  targetYear: number,
  targetMonth: number
): number {
  const created = doc.createdAt.toDate();
  const createdYear = created.getFullYear();
  const createdMonth = created.getMonth() + 1;
  if (targetYear < createdYear || (targetYear === createdYear && targetMonth < createdMonth)) {
    return 0;
  }
  const monthsElapsed = (targetYear - createdYear) * 12 + (targetMonth - createdMonth);
  switch (doc.frequency) {
    case 'MONTHLY':   return doc.amount;
    case 'WEEKLY':    return doc.amount * (52 / 12);
    case 'BIWEEKLY':  return doc.amount * (26 / 12);
    case 'QUARTERLY': return monthsElapsed % 3 === 0 ? doc.amount : 0;
    case 'YEARLY':    return monthsElapsed % 12 === 0 ? doc.amount : 0;
    default:          return 0;
  }
}

function addMonths(month: number, year: number, n: number): { month: number; year: number } {
  let m = month + n;
  let y = year;
  while (m > 12) { m -= 12; y++; }
  while (m < 1)  { m += 12; y--; }
  return { month: m, year: y };
}

function monthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

router.get(
  '/annual',
  authMiddleware,
  [
    query('offset')
      .optional()
      .isInt({ min: 0, max: 120 })
      .withMessage('offset must be a non-negative integer (months ahead of the current month)'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const now = new Date();
      const currentYear  = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      // Rolling 12-month window anchored on the current month — past months
      // are never included; `offset` (months) shifts the window forward so
      // the window keeps sliding into next year(s) as time passes.
      const offset = parseInt((req.query.offset as string | undefined) ?? '0', 10);
      const { month: startMonth, year: startYear } = addMonths(currentMonth, currentYear, offset);
      const lastMonthOfWindow = addMonths(startMonth, startYear, 11);

      // ── 1. Fetch data ─────────────────────────────────────────────────────
      const windowStart = Timestamp.fromDate(new Date(startYear, startMonth - 1, 1));
      const windowEnd   = Timestamp.fromDate(new Date(lastMonthOfWindow.year, lastMonthOfWindow.month, 0, 23, 59, 59));
      // Lookback range: transactions from up to a year before the window
      // start, needed to anchor installment purchases that began earlier
      // but still bill into the visible window.
      const lookbackStart = Timestamp.fromDate(new Date(startYear - 1, startMonth - 1, 1));

      const [txSnap, lookbackTxSnap, fixedExpSnap, recurringIncSnap, accountsSnap, pluggyItemsSnap] = await Promise.all([
        collections.transactions(userId).where('date', '>=', windowStart).where('date', '<=', windowEnd).get(),
        collections.transactions(userId).where('date', '>=', lookbackStart).where('date', '<', windowStart).get(),
        collections.fixedExpenses(userId).where('active', '==', true).get(),
        collections.recurringIncome(userId).where('active', '==', true).get(),
        collections.accounts(userId).get(),
        collections.pluggyItems(userId).get(),
      ]);

      const windowTxs      = txSnap.docs.map((d) => d.data() as TransactionDoc);
      const lookbackTxs    = lookbackTxSnap.docs.map((d) => d.data() as TransactionDoc);
      const fixedExpenses  = fixedExpSnap.docs.map((d) => d.data() as FixedExpenseDoc);
      const recurringIncomes = recurringIncSnap.docs.map((d) => d.data() as RecurringIncomeDoc);
      const allTxs = [...lookbackTxs, ...windowTxs];

      const accountMap = new Map<string, AccountDoc>();
      for (const doc of accountsSnap.docs) {
        const account = doc.data() as AccountDoc;
        accountMap.set(account.id, account);
      }
      const itemMap = new Map<string, PluggyItemDoc>();
      for (const doc of pluggyItemsSnap.docs) {
        const item = doc.data() as PluggyItemDoc;
        itemMap.set(item.pluggyItemId, item);
      }

      const expenseRows: ExpenseGridRow[] = [];

      // ── 2. Month skeleton ─────────────────────────────────────────────────
      // isPast is always false here — the window never reaches back before
      // the current month — kept on MonthPlan for shape-compatibility with
      // the rest of the aggregation logic (which only checks isPast||isCurrent).
      const months: MonthPlan[] = Array.from({ length: 12 }, (_, i) => {
        const { month, year: y } = addMonths(startMonth, startYear, i);
        return {
          month,
          year: y,
          isPast: false,
          isCurrent: y === currentYear && month === currentMonth,
          receitas: 0,
          despesasVariaveis: 0,
          despesasFixas: 0,
          receitasRecorrentes: 0,
          parceladas: [],
          totalParceladas: 0,
          saldo: 0,
        };
      });
      const monthIndex = new Map<string, number>(
        months.map((m, i) => [monthKey(m.year, m.month), i])
      );

      // ── 3. Income (credit transactions in the visible window) ─────────────
      for (const tx of windowTxs) {
        if (tx.type !== 'CREDIT') continue;
        const txDate = tx.date.toDate();
        const idx = monthIndex.get(monthKey(txDate.getFullYear(), txDate.getMonth() + 1));
        if (idx === undefined) continue;
        const plan = months[idx];
        if (plan.isPast || plan.isCurrent) plan.receitas += tx.amount;
      }

      // ── 4. Non-installment variable expenses ──────────────────────────────
      for (const tx of windowTxs) {
        if (tx.type !== 'DEBIT') continue;
        const { source } = extractInstallment(tx);
        if (source !== null) continue; // installments handled in step 5

        const txDate = tx.date.toDate();
        const idx = monthIndex.get(monthKey(txDate.getFullYear(), txDate.getMonth() + 1));
        if (idx === undefined) continue;
        const plan = months[idx];
        if (plan.isPast || plan.isCurrent) {
          const amount = Math.abs(tx.amount);
          plan.despesasVariaveis += amount;

          const monthlyCells: (MonthCell | null)[] = new Array(12).fill(null);
          monthlyCells[idx] = { amount, isProjected: false };
          expenseRows.push({
            id: `oneoff-${tx.id}`,
            description: stripInstallmentTokens(tx.description),
            category: tx.userCategory ?? tx.category,
            paymentMethod: resolvePaymentMethod(tx, accountMap, itemMap),
            kind: 'ONE_OFF',
            date: tx.date.toDate().toISOString(),
            totalAmount: amount,
            monthlyCells,
          });
        }
      }

      // ── 5. Installments — unified algorithm ───────────────────────────────
      //
      // Strategy (same for all connectors):
      //   • Group all installment transactions by purchase:
      //       1. Strongest id — creditCardMetadata.totalAmount (+ purchaseDate
      //          when present): identifies the purchase regardless of how the
      //          issuer truncates the description on each installment.
      //       2. Fallback — normalized description with prefix matching + total
      //          installments; the amount is matched with a small tolerance
      //          because issuers put the rounding remainder on one installment
      //          (e.g. R$ 1000 in 3x = 333.34 + 333.33 + 333.33).
      //   • Find the FIRST installment seen for each group (lowest installmentNumber).
      //   • The date of that first installment is the ANCHOR date.
      //   • Billing month for installment k  =  anchor + (k − 1) months.
      //   • This works because:
      //       – Mercado Pago / Samsung: all share purchase date; installment 1
      //         is always present with that date → anchor is the purchase date.
      //       – Nubank / Itaú: installment 1 has the first invoice date → same result.
      //   • Past/current months → only show installments with real DB transactions.
      //   • Future months → project from anchor even without real data.

      type PurchaseGroup = {
        total: number;
        firstCurr: number;      // installment number of the earliest seen
        firstDate: Date;        // tx.date of that earliest installment
        description: string;    // description stripped of installment tokens (for display)
        normDesc: string;
        refAmount: number;      // amount of the first tx seen (tolerance reference)
        purchaseTotal?: number;   // creditCardMetadata.totalAmount
        purchaseDateKey?: string; // creditCardMetadata.purchaseDate (YYYY-MM-DD)
        realAmounts: Map<number, number>; // installment number → real tx amount
        category: string;       // category of the first tx seen (for the grid row)
        paymentMethod: string | null; // resolved from the first tx seen
      };

      const groups: PurchaseGroup[] = [];

      for (const tx of allTxs) {
        if (tx.type !== 'DEBIT') continue;
        const { curr, total, source } = extractInstallment(tx);
        if (!source || curr === null || total === null) continue;
        if (curr <= 0 || total <= 0 || curr > total) continue;

        const amount = Math.abs(tx.amount);
        const txDate = tx.date.toDate();
        const normDesc = normalizeDescription(tx.description);
        const meta = tx.creditCardMetadata;
        const purchaseTotal = meta?.totalAmount != null ? Math.abs(meta.totalAmount) : undefined;
        const purchaseDateKey = meta?.purchaseDate ? String(meta.purchaseDate).slice(0, 10) : undefined;

        // The remainder-carrying installment can differ from the others by up
        // to `total` cents.
        const tolerance = (total + 1) / 100;

        let group = groups.find((g) => {
          if (g.total !== total || g.realAmounts.has(curr)) return false;
          if (Math.abs(g.refAmount - amount) > tolerance) return false;
          // When both sides carry the issuer's purchase id, it decides alone —
          // same id groups even with unrelated descriptions, different id
          // separates even with identical descriptions.
          if (g.purchaseTotal !== undefined && purchaseTotal !== undefined) {
            if (Math.abs(g.purchaseTotal - purchaseTotal) > 0.01) return false;
            if (g.purchaseDateKey && purchaseDateKey && g.purchaseDateKey !== purchaseDateKey) {
              return false;
            }
            return true;
          }
          return sameMerchant(g.normDesc, normDesc);
        });

        if (!group) {
          group = {
            total,
            firstCurr: curr,
            firstDate: txDate,
            description: stripInstallmentTokens(tx.description),
            normDesc,
            refAmount: amount,
            purchaseTotal,
            purchaseDateKey,
            realAmounts: new Map(),
            category: tx.userCategory ?? tx.category,
            paymentMethod: resolvePaymentMethod(tx, accountMap, itemMap),
          };
          groups.push(group);
        } else {
          // Keep the most informative (longest) description variant.
          const stripped = stripInstallmentTokens(tx.description);
          if (stripped.length > group.description.length) {
            group.description = stripped;
            group.normDesc = normDesc;
          }
          if (group.purchaseTotal === undefined) group.purchaseTotal = purchaseTotal;
          if (group.purchaseDateKey === undefined) group.purchaseDateKey = purchaseDateKey;
        }

        group.realAmounts.set(curr, amount);
        // Keep the LOWEST installment number as the anchor reference
        if (curr < group.firstCurr) {
          group.firstCurr = curr;
          group.firstDate = txDate;
        }
      }

      for (const group of groups) {
        // Anchor = what installment #1's date would be.
        // If firstCurr === 1, anchor = firstDate exactly (no shift).
        // If firstCurr > 1, we back-calculate: this is correct for billing-date
        // connectors (Nubank/Itaú) where each installment has a real invoice date.
        // For purchase-date connectors (Mercado Pago), installment 1 is always
        // present so firstCurr will be 1 and no back-calculation is needed.
        const anchor = addMonths(
          group.firstDate.getMonth() + 1,
          group.firstDate.getFullYear(),
          -(group.firstCurr - 1)   // e.g. firstCurr=3 → go back 2 months
        );

        // Projections use the amount of the highest real installment seen —
        // the rounding remainder, when present, sits on the first one.
        let lastKnownCurr = 0;
        for (const k of group.realAmounts.keys()) {
          if (k > lastKnownCurr) lastKnownCurr = k;
        }
        const projectedAmount = group.realAmounts.get(lastKnownCurr) ?? group.refAmount;

        const rowMonthlyCells: (MonthCell | null)[] = new Array(12).fill(null);
        let rowTotalAmount = 0;

        for (let k = 1; k <= group.total; k++) {
          const billing = addMonths(anchor.month, anchor.year, k - 1);
          const idx = monthIndex.get(monthKey(billing.year, billing.month));
          if (idx === undefined) continue;

          const plan = months[idx];
          const realAmount = group.realAmounts.get(k);
          const isReal = realAmount !== undefined;

          // Past/current: only show if Pluggy actually returned this installment.
          // Future: always show as projection.
          if (!isReal && (plan.isPast || plan.isCurrent)) continue;

          const entryAmount = realAmount ?? projectedAmount;
          plan.parceladas.push({
            description: group.description || `Parcela ${k}/${group.total}`,
            amount: entryAmount,
            installmentCurrent: k,
            installmentTotal: group.total,
            isProjected: !isReal,
          });
          plan.totalParceladas += entryAmount;

          rowMonthlyCells[idx] = { amount: entryAmount, isProjected: !isReal };
          rowTotalAmount += entryAmount;
        }

        if (rowMonthlyCells.some((c) => c !== null)) {
          expenseRows.push({
            id: `inst-${group.description}-${group.total}-${anchor.year}-${anchor.month}`,
            description: group.description || `Parcela 1/${group.total}`,
            category: group.category,
            paymentMethod: group.paymentMethod,
            kind: 'INSTALLMENT',
            installmentTotal: group.total,
            date: group.firstDate.toISOString(),
            totalAmount: rowTotalAmount,
            monthlyCells: rowMonthlyCells,
          });
        }
      }

      // ── 6. Fixed expenses + recurring income ──────────────────────────────
      for (const plan of months) {
        for (const exp of fixedExpenses)   plan.despesasFixas        += recurrenceAmount(exp, plan.year, plan.month);
        for (const inc of recurringIncomes) plan.receitasRecorrentes  += recurrenceAmount(inc, plan.year, plan.month);
      }

      for (const exp of fixedExpenses) {
        const monthlyCells: (MonthCell | null)[] = months.map((plan) => {
          const amount = recurrenceAmount(exp, plan.year, plan.month);
          return amount > 0 ? { amount, isProjected: false } : null;
        });
        const firstCell = monthlyCells.find((c) => c !== null);
        if (!firstCell) continue;

        expenseRows.push({
          id: `fixed-${exp.id}`,
          description: exp.name,
          category: exp.category,
          paymentMethod: null,
          kind: 'FIXED',
          totalAmount: firstCell.amount,
          monthlyCells,
        });
      }

      // Chronological reading order (print-style): recurring items with no
      // fixed date first, then one-off/installment purchases oldest → newest.
      expenseRows.sort((a, b) => {
        if (!a.date && !b.date) return a.description.localeCompare(b.description);
        if (!a.date) return -1;
        if (!b.date) return 1;
        return a.date.localeCompare(b.date);
      });

      // ── 7. Saldo ──────────────────────────────────────────────────────────
      for (const plan of months) {
        const income = plan.isPast || plan.isCurrent ? plan.receitas : plan.receitasRecorrentes;
        const spending =
          (plan.isPast || plan.isCurrent ? plan.despesasVariaveis : 0) +
          plan.despesasFixas +
          plan.totalParceladas;
        plan.saldo = income - spending;
      }

      res.json({ offset, months, expenseRows });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
