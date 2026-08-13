import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// Os hosts dos emuladores são definidos em playwright.config.ts (process.env),
// então este admin app fala APENAS com os emuladores.
const projectId = process.env.E2E_FIREBASE_PROJECT_ID;
if (!projectId) {
  throw new Error('E2E_FIREBASE_PROJECT_ID not set — run tests via playwright.config.ts');
}

const app = admin.apps.length ? admin.app() : admin.initializeApp({ projectId });

export const db = admin.firestore(app);
export const adminAuth = admin.auth(app);
export { Timestamp };

export async function uidByEmail(email: string): Promise<string> {
  const user = await adminAuth.getUserByEmail(email);
  return user.uid;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export interface SeededIds {
  bankAccountId: string;
  creditAccountId: string;
}

/**
 * Semeia no Firestore (emulado) o mesmo formato de dados que o sync da Pluggy
 * gravaria: um item, uma conta corrente, um cartão de crédito e transações.
 */
export async function seedUserData(uid: string): Promise<SeededIds> {
  const userRef = db.collection('users').doc(uid);
  const now = Timestamp.now();

  await userRef.collection('pluggyItems').doc('item-e2e').set({
    id: 'item-e2e',
    pluggyItemId: 'item-e2e',
    connectorId: 999,
    connectorName: 'Banco E2E',
    status: 'UPDATED',
    lastUpdatedAt: now,
    lastSyncAttempt: now,
    webhookUrl: 'http://localhost:4001/webhook',
    createdAt: now,
  });

  const bankRef = userRef.collection('accounts').doc();
  await bankRef.set({
    id: bankRef.id,
    pluggyAccountId: 'pluggy-acc-bank-e2e',
    pluggyItemId: 'item-e2e',
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    name: 'Conta Corrente E2E',
    number: '0001',
    balance: 2500,
    currencyCode: 'BRL',
    updatedAt: now,
  });

  const creditRef = userRef.collection('accounts').doc();
  await creditRef.set({
    id: creditRef.id,
    pluggyAccountId: 'pluggy-acc-credit-e2e',
    pluggyItemId: 'item-e2e',
    type: 'CREDIT',
    subtype: 'CREDIT_CARD',
    name: 'Cartão E2E',
    number: '9999',
    balance: 800,
    currencyCode: 'BRL',
    creditData: {
      creditLimit: 5000,
      availableCreditLimit: 4200,
      balanceCloseDate: '2026-08-01',
      balanceDueDate: '2026-08-10',
    },
    updatedAt: now,
  });

  const transactions = [
    {
      pluggyTransactionId: 'tx-e2e-1',
      accountId: bankRef.id,
      description: 'Mercado E2E',
      amount: -120.5,
      date: Timestamp.fromDate(daysAgo(3)),
      type: 'DEBIT',
      category: 'Groceries',
    },
    {
      pluggyTransactionId: 'tx-e2e-2',
      accountId: bankRef.id,
      description: 'Salario E2E',
      amount: 3000,
      date: Timestamp.fromDate(daysAgo(5)),
      type: 'CREDIT',
      category: 'Salary',
    },
    {
      pluggyTransactionId: 'tx-e2e-3',
      accountId: creditRef.id,
      description: 'Restaurante E2E',
      amount: -89.9,
      date: Timestamp.fromDate(daysAgo(1)),
      type: 'DEBIT',
      category: 'Eating out',
    },
  ];

  for (const tx of transactions) {
    const ref = userRef.collection('transactions').doc();
    await ref.set({ id: ref.id, syncedAt: now, ...tx });
  }

  return { bankAccountId: bankRef.id, creditAccountId: creditRef.id };
}
