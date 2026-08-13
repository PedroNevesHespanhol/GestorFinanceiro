import { Timestamp } from 'firebase-admin/firestore';
import { pluggyClient } from './pluggy';
import {
  collections,
  upsertAccount,
  upsertTransaction,
  AccountDoc,
  TransactionDoc,
  CreditCardMetadata,
  SyncLogDoc,
  PluggyItemDoc,
} from './firestore';
import { db } from '../config/firebase';

export interface SyncResult {
  accountsSynced: number;
  transactionsSynced: number;
  errors: string[];
}

// ─── Sync a single Pluggy item for a user ────────────────────────────────────

export async function syncPluggyItem(
  userId: string,
  pluggyItemId: string
): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    accountsSynced: 0,
    transactionsSynced: 0,
    errors: [],
  };

  try {
    // Fetch all accounts for this item
    const accountsResponse = await pluggyClient.fetchAccounts(pluggyItemId);
    const accounts = accountsResponse.results ?? [];

    for (const account of accounts) {
      try {
        const accountType =
          account.type === 'CREDIT' ? 'CREDIT' : 'BANK';

        const accountData: Omit<AccountDoc, 'id'> = {
          pluggyAccountId: account.id,
          pluggyItemId,
          type: accountType,
          subtype: account.subtype ?? '',
          name: account.name,
          number: account.number ?? '',
          balance: account.balance,
          currencyCode: 'BRL',
          updatedAt: Timestamp.now(),
        };

        if (account.creditData) {
          const toDateString = (v: string | Date | undefined | null): string => {
            if (!v) return '';
            if (v instanceof Date) return v.toISOString().split('T')[0];
            return v;
          };
          accountData.creditData = {
            creditLimit: account.creditData.creditLimit ?? 0,
            availableCreditLimit: account.creditData.availableCreditLimit ?? 0,
            balanceCloseDate: toDateString(account.creditData.balanceCloseDate),
            balanceDueDate: toDateString(account.creditData.balanceDueDate),
          };
        }

        const savedAccount = await upsertAccount(userId, accountData);
        result.accountsSynced++;

        // Fetch transactions for this account (last 90 days) using cursor pagination
        const dateTo = new Date();
        const dateFrom = new Date();
        dateFrom.setDate(dateTo.getDate() - 90);

        const transactions = await pluggyClient.fetchAllTransactions(account.id, {
          dateFrom: dateFrom.toISOString().split('T')[0],
          dateTo: dateTo.toISOString().split('T')[0],
        });

        for (const tx of transactions) {
          const txData: Omit<TransactionDoc, 'id'> = {
            pluggyTransactionId: tx.id,
            accountId: savedAccount.id,
            description: tx.description,
            amount: tx.amount,
            date: Timestamp.fromDate(new Date(tx.date)),
            type: tx.type === 'CREDIT' ? 'CREDIT' : 'DEBIT',
            category: tx.category ?? 'Outros',
            syncedAt: Timestamp.now(),
          };

          if (tx.paymentData) {
            txData.paymentData = {
              paymentMethod: tx.paymentData.paymentMethod ?? '',
              payer: tx.paymentData.payer
                ? { name: tx.paymentData.payer.name ?? '' }
                : undefined,
              receiver: tx.paymentData.receiver
                ? { name: tx.paymentData.receiver.name ?? '' }
                : undefined,
            };
          }

          if (tx.creditCardMetadata) {
            const meta: CreditCardMetadata = {};
            if (tx.creditCardMetadata.installmentNumber != null)
              meta.installmentNumber = tx.creditCardMetadata.installmentNumber;
            if (tx.creditCardMetadata.totalInstallments != null)
              meta.totalInstallments = tx.creditCardMetadata.totalInstallments;
            if (tx.creditCardMetadata.totalAmount != null)
              meta.totalAmount = tx.creditCardMetadata.totalAmount;
            if (tx.creditCardMetadata.purchaseDate != null)
              meta.purchaseDate = new Date(tx.creditCardMetadata.purchaseDate)
                .toISOString()
                .split('T')[0];
            if (Object.keys(meta).length > 0) txData.creditCardMetadata = meta;
          }

          const { created } = await upsertTransaction(userId, txData);
          if (created) {
            result.transactionsSynced++;
          }
        }
      } catch (accountError) {
        const msg =
          accountError instanceof Error
            ? accountError.message
            : String(accountError);
        result.errors.push(`Account ${account.id}: ${msg}`);
      }
    }

    // Write sync log — success
    await writeSyncLog(userId, pluggyItemId, {
      status: 'SUCCESS',
      transactionsSynced: result.transactionsSynced,
      accountsSynced: result.accountsSynced,
      duration: Date.now() - startTime,
    });

    // Update pluggyItem status
    await updatePluggyItemStatus(userId, pluggyItemId, 'UPDATED');
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : String(err);
    result.errors.push(errorMessage);

    await writeSyncLog(userId, pluggyItemId, {
      status: 'ERROR',
      transactionsSynced: 0,
      accountsSynced: 0,
      errorMessage,
      duration: Date.now() - startTime,
    });

    await updatePluggyItemStatus(userId, pluggyItemId, 'ERROR');
    throw err;
  }

  return result;
}

// ─── Sync all items for a user ────────────────────────────────────────────────

export async function syncAllUserItems(userId: string): Promise<SyncResult[]> {
  const itemsSnap = await collections.pluggyItems(userId).get();
  const items = itemsSnap.docs.map((d) => d.data() as PluggyItemDoc);

  const results: SyncResult[] = [];
  for (const item of items) {
    try {
      const result = await syncPluggyItem(userId, item.pluggyItemId);
      results.push(result);
    } catch {
      results.push({ accountsSynced: 0, transactionsSynced: 0, errors: [`Failed to sync item ${item.pluggyItemId}`] });
    }
  }
  return results;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface SyncLogInput {
  status: 'SUCCESS' | 'ERROR';
  transactionsSynced: number;
  accountsSynced: number;
  errorMessage?: string;
  duration: number;
}

async function writeSyncLog(
  userId: string,
  pluggyItemId: string,
  data: SyncLogInput
): Promise<void> {
  const ref = collections.syncLogs(userId).doc();
  const log: SyncLogDoc = {
    id: ref.id,
    pluggyItemId,
    syncedAt: Timestamp.now(),
    ...data,
    transactionsSynced: data.transactionsSynced,
    accountsSynced: data.accountsSynced,
  };
  await ref.set(log);
}

async function updatePluggyItemStatus(
  userId: string,
  pluggyItemId: string,
  status: PluggyItemDoc['status']
): Promise<void> {
  const snap = await collections
    .pluggyItems(userId)
    .where('pluggyItemId', '==', pluggyItemId)
    .limit(1)
    .get();

  if (!snap.empty) {
    await snap.docs[0].ref.update({
      status,
      lastSyncAttempt: Timestamp.now(),
      lastUpdatedAt: status === 'UPDATED' ? Timestamp.now() : snap.docs[0].data().lastUpdatedAt,
    });
  }
}

// ─── Find userId by pluggyItemId (for webhooks) ───────────────────────────────
//
// Usa collectionGroup para evitar varrer TODOS os documentos de usuários.
// Requer índice no Firestore: collectionGroup "pluggyItems", campo "pluggyItemId" ASC.
// Crie com: firestore indexes:create ou via Console > Indexes.

export async function findUserIdByPluggyItemId(
  pluggyItemId: string
): Promise<string | null> {
  const snap = await db
    .collectionGroup('pluggyItems')
    .where('pluggyItemId', '==', pluggyItemId)
    .limit(1)
    .get();

  if (snap.empty) {
    return null;
  }

  // O path do documento é: users/{userId}/pluggyItems/{itemId}
  // ref.parent é a subcoleção pluggyItems, ref.parent.parent é o doc do usuário
  const userId = snap.docs[0].ref.parent.parent?.id ?? null;
  return userId;
}
