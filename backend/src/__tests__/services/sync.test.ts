// ─── Mock firebase-admin/firestore ───────────────────────────────────────────

const mockTimestampNow = { seconds: 1234567890, nanoseconds: 0 };

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  Timestamp: {
    now: jest.fn(() => mockTimestampNow),
    fromDate: jest.fn((d: Date) => ({
      seconds: Math.floor(d.getTime() / 1000),
      nanoseconds: 0,
    })),
  },
}));

// ─── Mock pluggy-sdk ──────────────────────────────────────────────────────────

const mockFetchAccounts = jest.fn();
const mockFetchAllTransactions = jest.fn();

jest.mock('pluggy-sdk', () => ({
  PluggyClient: jest.fn().mockImplementation(() => ({
    fetchAccounts: mockFetchAccounts,
    fetchAllTransactions: mockFetchAllTransactions,
  })),
}));

// ─── Mock ../services/pluggy ──────────────────────────────────────────────────

jest.mock('../../services/pluggy', () => ({
  pluggyClient: {
    fetchAccounts: mockFetchAccounts,
    fetchAllTransactions: mockFetchAllTransactions,
  },
}));

// ─── Mock ../config/firebase (used directly by findUserIdByPluggyItemId) ─────

const mockCollectionGroupGet = jest.fn();
const mockCollectionGroupLimit = jest.fn(() => ({ get: mockCollectionGroupGet }));
const mockCollectionGroupWhere = jest.fn(() => ({ limit: mockCollectionGroupLimit }));
const mockCollectionGroup = jest.fn(() => ({ where: mockCollectionGroupWhere }));

jest.mock('../../config/firebase', () => ({
  db: { collectionGroup: mockCollectionGroup },
  auth: { verifyIdToken: jest.fn() },
}));

// ─── Shared Firestore mock state ──────────────────────────────────────────────

const mockSyncLogDocSet = jest.fn();
const mockSyncLogDocId = 'sync-log-id';
const mockSyncLogDocRef = { id: mockSyncLogDocId, set: mockSyncLogDocSet };

const mockCollectionGet = jest.fn();
const mockWhere = jest.fn();
const mockLimit = jest.fn();

mockWhere.mockReturnValue({ limit: mockLimit });
mockLimit.mockReturnValue({ get: mockCollectionGet });

// ─── Mock upsertAccount and upsertTransaction ─────────────────────────────────

const mockUpsertAccount = jest.fn();
const mockUpsertTransaction = jest.fn();

jest.mock('../../services/firestore', () => ({
  collections: {
    pluggyItems: jest.fn().mockReturnValue({
      where: mockWhere,
      get: jest.fn(),
    }),
    accounts: jest.fn().mockReturnValue({
      where: mockWhere,
      doc: jest.fn().mockReturnValue({ set: jest.fn() }),
    }),
    transactions: jest.fn().mockReturnValue({
      where: mockWhere,
      doc: jest.fn().mockReturnValue({ set: jest.fn() }),
    }),
    syncLogs: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue(mockSyncLogDocRef),
    }),
  },
  upsertAccount: mockUpsertAccount,
  upsertTransaction: mockUpsertTransaction,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  syncPluggyItem,
  findUserIdByPluggyItemId,
} from '../../services/sync';
import { collections } from '../../services/firestore';

// ─── Test data factories ──────────────────────────────────────────────────────

function makePluggyAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pluggy-acc-001',
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    name: 'Conta Corrente',
    number: '12345-6',
    balance: 1000,
    creditData: null,
    ...overrides,
  };
}

function makePluggyTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pluggy-tx-001',
    description: 'Supermercado',
    amount: -150.5,
    date: '2026-06-01',
    type: 'DEBIT',
    category: 'Alimentação',
    paymentData: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('syncPluggyItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Re-apply chaining after clearAllMocks
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockLimit.mockReturnValue({ get: mockCollectionGet });

    // pluggyItems().where().limit().get() — empty by default (no item to update)
    mockCollectionGet.mockResolvedValue({ empty: true, docs: [] });

    // syncLogs doc
    mockSyncLogDocSet.mockResolvedValue(undefined);
    (collections.syncLogs as jest.Mock).mockReturnValue({
      doc: jest.fn().mockReturnValue(mockSyncLogDocRef),
    });

    // pluggyItems — for updatePluggyItemStatus
    (collections.pluggyItems as jest.Mock).mockReturnValue({
      where: mockWhere,
      get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
    });

    // fetchAllTransactions returns a plain array (already paginated internally by the SDK)
    mockFetchAllTransactions.mockResolvedValue([]);
  });

  it('deve chamar fetchAccounts e fetchAllTransactions do Pluggy', async () => {
    const account = makePluggyAccount();
    const tx = makePluggyTransaction();

    mockFetchAccounts.mockResolvedValueOnce({ results: [account] });
    mockFetchAllTransactions.mockResolvedValueOnce([tx]);

    mockUpsertAccount.mockResolvedValueOnce({ ...account, id: 'local-acc-id' });
    mockUpsertTransaction.mockResolvedValueOnce({ created: true });

    await syncPluggyItem('user-001', 'item-001');

    expect(mockFetchAccounts).toHaveBeenCalledWith('item-001');
    expect(mockFetchAllTransactions).toHaveBeenCalledWith(
      'pluggy-acc-001',
      expect.objectContaining({ dateFrom: expect.any(String), dateTo: expect.any(String) })
    );
  });

  it('deve chamar upsertTransaction para cada transação', async () => {
    const account = makePluggyAccount();
    const transactions = [
      makePluggyTransaction({ id: 'tx-001' }),
      makePluggyTransaction({ id: 'tx-002' }),
      makePluggyTransaction({ id: 'tx-003' }),
    ];

    mockFetchAccounts.mockResolvedValueOnce({ results: [account] });
    mockFetchAllTransactions.mockResolvedValueOnce(transactions);

    mockUpsertAccount.mockResolvedValueOnce({ ...account, id: 'local-acc-id' });
    mockUpsertTransaction.mockResolvedValue({ created: true });

    await syncPluggyItem('user-001', 'item-001');

    expect(mockUpsertTransaction).toHaveBeenCalledTimes(3);
  });

  it('deve escrever syncLog com status SUCCESS ao finalizar', async () => {
    const account = makePluggyAccount();

    mockFetchAccounts.mockResolvedValueOnce({ results: [account] });
    mockFetchAllTransactions.mockResolvedValueOnce([]);

    mockUpsertAccount.mockResolvedValueOnce({ ...account, id: 'local-acc-id' });

    await syncPluggyItem('user-001', 'item-001');

    expect(mockSyncLogDocSet).toHaveBeenCalledTimes(1);
    const logWritten = mockSyncLogDocSet.mock.calls[0][0] as Record<string, unknown>;
    expect(logWritten).toMatchObject({
      status: 'SUCCESS',
      pluggyItemId: 'item-001',
    });
  });

  it('deve escrever syncLog com status ERROR e re-throw se Pluggy falhar', async () => {
    const pluggyError = new Error('Pluggy API down');
    mockFetchAccounts.mockRejectedValueOnce(pluggyError);

    await expect(syncPluggyItem('user-001', 'item-001')).rejects.toThrow('Pluggy API down');

    expect(mockSyncLogDocSet).toHaveBeenCalledTimes(1);
    const logWritten = mockSyncLogDocSet.mock.calls[0][0] as Record<string, unknown>;
    expect(logWritten).toMatchObject({
      status: 'ERROR',
      pluggyItemId: 'item-001',
      errorMessage: 'Pluggy API down',
    });
  });

  it('deve contar apenas transações criadas (created: true) em transactionsSynced', async () => {
    const account = makePluggyAccount();
    const transactions = [
      makePluggyTransaction({ id: 'tx-001' }),
      makePluggyTransaction({ id: 'tx-002' }),
    ];

    mockFetchAccounts.mockResolvedValueOnce({ results: [account] });
    mockFetchAllTransactions.mockResolvedValueOnce(transactions);
    mockUpsertAccount.mockResolvedValueOnce({ ...account, id: 'local-acc-id' });

    // First tx created, second is an update
    mockUpsertTransaction
      .mockResolvedValueOnce({ created: true })
      .mockResolvedValueOnce({ created: false });

    const result = await syncPluggyItem('user-001', 'item-001');

    expect(result.transactionsSynced).toBe(1);
    expect(result.accountsSynced).toBe(1);
  });
});

describe('findUserIdByPluggyItemId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCollectionGroupWhere.mockReturnValue({ limit: mockCollectionGroupLimit });
    mockCollectionGroupLimit.mockReturnValue({ get: mockCollectionGroupGet });
  });

  it('deve retornar o userId dono do documento pluggyItems encontrado via collectionGroup', async () => {
    mockCollectionGroupGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ ref: { parent: { parent: { id: 'user-002' } } } }],
    });

    const userId = await findUserIdByPluggyItemId('item-999');

    expect(userId).toBe('user-002');
    expect(mockCollectionGroup).toHaveBeenCalledWith('pluggyItems');
    expect(mockCollectionGroupWhere).toHaveBeenCalledWith('pluggyItemId', '==', 'item-999');
  });

  it('deve retornar null se pluggyItemId não encontrado', async () => {
    mockCollectionGroupGet.mockResolvedValueOnce({ empty: true, docs: [] });

    const userId = await findUserIdByPluggyItemId('item-unknown');

    expect(userId).toBeNull();
  });
});
