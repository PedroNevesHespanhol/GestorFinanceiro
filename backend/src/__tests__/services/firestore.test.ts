import { upsertTransaction, upsertAccount } from '../../services/firestore';

// ─── Mock firebase-admin/firestore ───────────────────────────────────────────

const mockTimestampNow = { seconds: 1234567890, nanoseconds: 0 };
const mockTimestampFromDate = (d: Date) => ({
  seconds: Math.floor(d.getTime() / 1000),
  nanoseconds: 0,
});

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  Timestamp: {
    now: jest.fn(() => mockTimestampNow),
    fromDate: jest.fn((d: Date) => mockTimestampFromDate(d)),
  },
}));

// ─── Shared mock doc references ───────────────────────────────────────────────

// Collection-level query mocks
const mockCollectionGet = jest.fn();
const mockLimit = jest.fn();
const mockWhere = jest.fn();
const mockCollectionDoc = jest.fn();

const mockCollection = {
  doc: mockCollectionDoc,
  where: mockWhere,
  limit: mockLimit,
  get: mockCollectionGet,
};

const mockDocGet = jest.fn();
const mockDocSet = jest.fn();
const mockDocUpdate = jest.fn();
const mockDocId = 'generated-doc-id';

const mockDocRef = {
  id: mockDocId,
  get: mockDocGet,
  set: mockDocSet,
  update: mockDocUpdate,
  // users/{userId} is itself a doc — collections.transactions/accounts/etc.
  // chain a `.collection(...)` off of it to reach the subcollection.
  collection: jest.fn().mockReturnValue(mockCollection),
};

// Chaining: where().limit().get()
mockWhere.mockReturnValue({ limit: mockLimit });
mockLimit.mockReturnValue({ get: mockCollectionGet });
mockCollectionDoc.mockReturnValue(mockDocRef);

// ─── Mock ../config/firebase ──────────────────────────────────────────────────

jest.mock('../../config/firebase', () => ({
  db: {
    collection: jest.fn().mockImplementation(() => ({
      doc: mockCollectionDoc,
      where: mockWhere,
      limit: mockLimit,
      get: mockCollectionGet,
    })),
  },
  auth: {
    verifyIdToken: jest.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { Timestamp } from 'firebase-admin/firestore';
import { TransactionDoc, AccountDoc } from '../../services/firestore';

function makeTxData(): Omit<TransactionDoc, 'id'> {
  return {
    pluggyTransactionId: 'pluggy-tx-001',
    accountId: 'account-001',
    description: 'Supermercado',
    amount: -150.5,
    date: Timestamp.now(),
    type: 'DEBIT',
    category: 'Alimentação',
    syncedAt: Timestamp.now(),
  };
}

function makeAccountData(): Omit<AccountDoc, 'id'> {
  return {
    pluggyAccountId: 'pluggy-acc-001',
    pluggyItemId: 'item-001',
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    name: 'Conta Corrente',
    number: '12345-6',
    balance: 1000,
    currencyCode: 'BRL',
    updatedAt: Timestamp.now(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('upsertTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply chaining after clearAllMocks
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockReturnValue({ get: mockCollectionGet });
    mockCollectionDoc.mockReturnValue(mockDocRef);
  });

  it('deve criar nova transação quando pluggyTransactionId não existe', async () => {
    // Simulate empty query result (no existing transaction)
    mockCollectionGet.mockResolvedValueOnce({ empty: true, docs: [] });
    mockDocSet.mockResolvedValueOnce(undefined);

    const result = await upsertTransaction('user-001', makeTxData());

    expect(result).toEqual({ created: true });
    expect(mockDocSet).toHaveBeenCalledTimes(1);
    expect(mockDocUpdate).not.toHaveBeenCalled();
  });

  it('deve atualizar transação existente (sem criar duplicata) quando mesmo pluggyTransactionId', async () => {
    const existingRef = {
      update: jest.fn().mockResolvedValueOnce(undefined),
    };

    mockCollectionGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ ref: existingRef }],
    });

    const result = await upsertTransaction('user-001', makeTxData());

    expect(result).toEqual({ created: false });
    expect(existingRef.update).toHaveBeenCalledTimes(1);
    expect(mockDocSet).not.toHaveBeenCalled();
  });

  it('deve preservar campos do usuário (userCategory, tags, notes) ao atualizar', async () => {
    const existingRef = {
      update: jest.fn().mockResolvedValueOnce(undefined),
    };

    mockCollectionGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ ref: existingRef }],
    });

    const txWithUserFields: Omit<TransactionDoc, 'id'> = {
      ...makeTxData(),
      userCategory: 'Mercado',
      tags: ['mensal', 'essencial'],
      notes: 'Compra semanal',
    };

    await upsertTransaction('user-001', txWithUserFields);

    // update should only contain sync fields — NOT userCategory, tags, notes
    const updateCall = existingRef.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updateCall).not.toHaveProperty('userCategory');
    expect(updateCall).not.toHaveProperty('tags');
    expect(updateCall).not.toHaveProperty('notes');

    // But it should contain sync fields
    expect(updateCall).toHaveProperty('description');
    expect(updateCall).toHaveProperty('amount');
    expect(updateCall).toHaveProperty('syncedAt');
  });
});

describe('upsertAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockReturnValue({ get: mockCollectionGet });
    mockCollectionDoc.mockReturnValue(mockDocRef);
  });

  it('deve criar conta nova quando pluggyAccountId não existe', async () => {
    mockCollectionGet.mockResolvedValueOnce({ empty: true, docs: [] });
    mockDocSet.mockResolvedValueOnce(undefined);

    const result = await upsertAccount('user-001', makeAccountData());

    expect(result).toHaveProperty('pluggyAccountId', 'pluggy-acc-001');
    expect(mockDocSet).toHaveBeenCalledTimes(1);
    expect(mockDocUpdate).not.toHaveBeenCalled();
  });

  it('deve atualizar conta existente por pluggyAccountId', async () => {
    const updatedAccountData = {
      ...makeAccountData(),
      balance: 2000,
    };

    const existingGetResult = {
      data: jest.fn().mockReturnValue({
        id: 'existing-doc-id',
        ...updatedAccountData,
      }),
    };

    const existingRef = {
      update: jest.fn().mockResolvedValueOnce(undefined),
      get: jest.fn().mockResolvedValueOnce(existingGetResult),
    };

    mockCollectionGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ ref: existingRef }],
    });

    const result = await upsertAccount('user-001', updatedAccountData);

    expect(existingRef.update).toHaveBeenCalledTimes(1);
    expect(mockDocSet).not.toHaveBeenCalled();

    const updateCall = existingRef.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updateCall).toHaveProperty('balance', 2000);
    expect(result).toHaveProperty('balance', 2000);
  });

  it('deve criar conta com creditData quando fornecido', async () => {
    mockCollectionGet.mockResolvedValueOnce({ empty: true, docs: [] });
    mockDocSet.mockResolvedValueOnce(undefined);

    const accountWithCredit: Omit<AccountDoc, 'id'> = {
      ...makeAccountData(),
      type: 'CREDIT',
      creditData: {
        creditLimit: 5000,
        availableCreditLimit: 3000,
        balanceCloseDate: '2026-06-20',
        balanceDueDate: '2026-06-27',
      },
    };

    const result = await upsertAccount('user-001', accountWithCredit);

    expect(mockDocSet).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('type', 'CREDIT');
    expect(result).toHaveProperty('creditData');
  });
});
