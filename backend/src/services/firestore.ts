import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase';

// ─── Firestore document interfaces ───────────────────────────────────────────

export interface UserDoc {
  id: string;
  email: string;
  name: string;
  googleId: string;
  createdAt: Timestamp;
  pluggyCustomerId?: string;
}

export interface PluggyItemDoc {
  id: string;
  pluggyItemId: string;
  connectorId: number;
  connectorName: string;
  status: 'UPDATED' | 'ERROR' | 'WAITING_USER_ACTION';
  statusDetail?: string;
  lastUpdatedAt: Timestamp;
  lastSyncAttempt: Timestamp;
  webhookUrl: string;
  createdAt: Timestamp;
}

export interface CreditData {
  creditLimit: number;
  availableCreditLimit: number;
  balanceCloseDate: string;
  balanceDueDate: string;
}

export interface AccountDoc {
  id: string;
  pluggyAccountId: string;
  pluggyItemId: string;
  type: 'BANK' | 'CREDIT';
  subtype: string;
  name: string;
  number: string;
  balance: number;
  currencyCode: 'BRL';
  creditData?: CreditData;
  updatedAt: Timestamp;
}

export interface PaymentData {
  paymentMethod: string;
  payer?: { name: string };
  receiver?: { name: string };
}

export interface CreditCardMetadata {
  installmentNumber?: number;
  totalInstallments?: number;
  totalAmount?: number;
  /** Original purchase date (YYYY-MM-DD) — with totalAmount, identifies the purchase */
  purchaseDate?: string;
}

export interface TransactionDoc {
  id: string;
  pluggyTransactionId: string;
  accountId: string;
  description: string;
  amount: number;
  date: Timestamp;
  type: 'DEBIT' | 'CREDIT';
  category: string;
  paymentData?: PaymentData;
  creditCardMetadata?: CreditCardMetadata | null;
  userCategory?: string;
  tags?: string[];
  notes?: string;
  linkedSplitReimbursement?: string;
  syncedAt: Timestamp;
}

export interface FixedExpenseDoc {
  id: string;
  name: string;
  amount: number;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  category: string;
  dueDate?: number;
  active: boolean;
  createdAt: Timestamp;
}

export interface RecurringIncomeDoc {
  id: string;
  name: string;
  amount: number;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  category: string;
  expectedDate?: number;
  active: boolean;
  createdAt: Timestamp;
}

export interface SplitParticipant {
  id: string;
  name: string;
  email?: string;
  amount: number;
  settled: boolean;
  settledAt?: Timestamp;
}

export interface SplitReimbursementDoc {
  id: string;
  description: string;
  totalAmount: number;
  currency: 'BRL';
  date: Timestamp;
  participants: SplitParticipant[];
  status: 'PENDING' | 'PARTIALLY_SETTLED' | 'SETTLED';
  paidBy: string;
  createdAt: Timestamp;
}

export interface SyncLogDoc {
  id: string;
  pluggyItemId: string;
  status: 'SUCCESS' | 'ERROR';
  transactionsSynced: number;
  accountsSynced: number;
  errorMessage?: string;
  syncedAt: Timestamp;
  duration: number;
}

// ─── Collection helpers ───────────────────────────────────────────────────────

export const collections = {
  users: () => db.collection('users'),
  user: (userId: string) => db.collection('users').doc(userId),

  pluggyItems: (userId: string) =>
    db.collection('users').doc(userId).collection('pluggyItems'),
  pluggyItem: (userId: string, itemId: string) =>
    db.collection('users').doc(userId).collection('pluggyItems').doc(itemId),

  accounts: (userId: string) =>
    db.collection('users').doc(userId).collection('accounts'),
  account: (userId: string, accountId: string) =>
    db.collection('users').doc(userId).collection('accounts').doc(accountId),

  transactions: (userId: string) =>
    db.collection('users').doc(userId).collection('transactions'),
  transaction: (userId: string, txId: string) =>
    db.collection('users').doc(userId).collection('transactions').doc(txId),

  fixedExpenses: (userId: string) =>
    db.collection('users').doc(userId).collection('fixedExpenses'),
  fixedExpense: (userId: string, expId: string) =>
    db.collection('users').doc(userId).collection('fixedExpenses').doc(expId),

  recurringIncome: (userId: string) =>
    db.collection('users').doc(userId).collection('recurringIncome'),
  recurringIncomeDoc: (userId: string, incId: string) =>
    db.collection('users').doc(userId).collection('recurringIncome').doc(incId),

  splitReimbursements: (userId: string) =>
    db.collection('users').doc(userId).collection('splitReimbursements'),
  splitReimbursement: (userId: string, splitId: string) =>
    db
      .collection('users')
      .doc(userId)
      .collection('splitReimbursements')
      .doc(splitId),

  syncLogs: (userId: string) =>
    db.collection('users').doc(userId).collection('syncLogs'),
};

// ─── User helpers ─────────────────────────────────────────────────────────────

export async function upsertUser(
  userId: string,
  data: Omit<UserDoc, 'id' | 'createdAt'>
): Promise<UserDoc> {
  const ref = collections.user(userId);
  const snap = await ref.get();

  if (snap.exists) {
    await ref.update({
      email: data.email,
      name: data.name,
      googleId: data.googleId,
    });
    return (await ref.get()).data() as UserDoc;
  }

  const doc: UserDoc = {
    id: userId,
    ...data,
    createdAt: Timestamp.now(),
  };
  await ref.set(doc);
  return doc;
}

export async function getUser(userId: string): Promise<UserDoc | null> {
  const snap = await collections.user(userId).get();
  return snap.exists ? (snap.data() as UserDoc) : null;
}

// ─── Transaction deduplication upsert ────────────────────────────────────────

export async function upsertTransaction(
  userId: string,
  tx: Omit<TransactionDoc, 'id'>
): Promise<{ created: boolean }> {
  const existing = await collections
    .transactions(userId)
    .where('pluggyTransactionId', '==', tx.pluggyTransactionId)
    .limit(1)
    .get();

  if (!existing.empty) {
    // Update only sync-related fields; preserve user annotations
    const docRef = existing.docs[0].ref;
    await docRef.update({
      description: tx.description,
      amount: tx.amount,
      date: tx.date,
      type: tx.type,
      category: tx.category,
      paymentData: tx.paymentData ?? null,
      creditCardMetadata: tx.creditCardMetadata ?? null,
      syncedAt: tx.syncedAt,
    });
    return { created: false };
  }

  const newRef = collections.transactions(userId).doc();
  const doc: TransactionDoc = { id: newRef.id, ...tx };
  await newRef.set(doc);
  return { created: true };
}

// ─── Account upsert ───────────────────────────────────────────────────────────

export async function upsertAccount(
  userId: string,
  account: Omit<AccountDoc, 'id'>
): Promise<AccountDoc> {
  const existing = await collections
    .accounts(userId)
    .where('pluggyAccountId', '==', account.pluggyAccountId)
    .limit(1)
    .get();

  if (!existing.empty) {
    const docRef = existing.docs[0].ref;
    await docRef.update({
      balance: account.balance,
      creditData: account.creditData ?? null,
      updatedAt: account.updatedAt,
    });
    return (await docRef.get()).data() as AccountDoc;
  }

  const newRef = collections.accounts(userId).doc();
  const doc: AccountDoc = { id: newRef.id, ...account };
  await newRef.set(doc);
  return doc;
}
