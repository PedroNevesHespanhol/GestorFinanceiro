// ─── Mocks (must be declared before imports) ──────────────────────────────────

const mockVerifyIdToken = jest.fn();

jest.mock('../../config/firebase', () => ({
  db: {},
  auth: { verifyIdToken: mockVerifyIdToken },
}));

const mockAccountsOrderBy = jest.fn();
const mockAccountsGet = jest.fn();
const accountsQuery = { orderBy: mockAccountsOrderBy };
mockAccountsOrderBy.mockReturnValue({ get: mockAccountsGet });

const mockPluggyItemsGet = jest.fn();
const pluggyItemsQuery = { get: mockPluggyItemsGet };

jest.mock('../../services/firestore', () => ({
  collections: {
    accounts: jest.fn(() => accountsQuery),
    pluggyItems: jest.fn(() => pluggyItemsQuery),
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import express from 'express';
import request from 'supertest';
import { Timestamp } from 'firebase-admin/firestore';
import accountsRoutes from '../../routes/accounts';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/accounts', accountsRoutes);
  return app;
}

function toTimestamp(date: Date) {
  return { toDate: () => date };
}

function makeAccountDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-001',
    pluggyAccountId: 'pluggy-acc-001',
    pluggyItemId: 'item-001',
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    name: 'Conta Corrente',
    number: '1234',
    balance: 1000,
    currencyCode: 'BRL',
    updatedAt: toTimestamp(new Date('2026-07-01T12:00:00')),
    ...overrides,
  };
}

function makePluggyItemDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-001',
    pluggyItemId: 'item-001',
    connectorId: 1,
    connectorName: 'Banco Teste',
    status: 'UPDATED',
    lastUpdatedAt: toTimestamp(new Date('2026-07-01T12:00:00')),
    lastSyncAttempt: toTimestamp(new Date('2026-07-01T12:00:00')),
    webhookUrl: 'https://example.com/webhook',
    createdAt: toTimestamp(new Date('2026-07-01T12:00:00')),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /accounts', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'user@test.com' });
    app = buildApp();
  });

  it('deve retornar 401 sem Authorization header', async () => {
    const res = await request(app).get('/accounts');
    expect(res.status).toBe(401);
  });

  it('deve retornar contas enriquecidas com o status do item Pluggy correspondente', async () => {
    mockAccountsGet.mockResolvedValueOnce({
      docs: [{ data: () => makeAccountDoc({ pluggyItemId: 'item-001' }) }],
    });
    mockPluggyItemsGet.mockResolvedValueOnce({
      docs: [{ data: () => makePluggyItemDoc({ pluggyItemId: 'item-001', status: 'ERROR' }) }],
    });

    const res = await request(app)
      .get('/accounts')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.accounts).toHaveLength(1);
    expect(res.body.accounts[0]).toMatchObject({ id: 'acc-001', status: 'ERROR' });
    expect(mockAccountsOrderBy).toHaveBeenCalledWith('name');
  });

  it('deve usar status UPDATED como padrão quando não há item Pluggy correspondente', async () => {
    mockAccountsGet.mockResolvedValueOnce({
      docs: [{ data: () => makeAccountDoc({ pluggyItemId: 'item-sem-match' }) }],
    });
    mockPluggyItemsGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(app)
      .get('/accounts')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.accounts[0]).toMatchObject({ status: 'UPDATED' });
  });

  it('deve retornar lista vazia quando o usuário não tem contas', async () => {
    mockAccountsGet.mockResolvedValueOnce({ docs: [] });
    mockPluggyItemsGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(app)
      .get('/accounts')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.accounts).toEqual([]);
  });

  it('deve achatar creditData e expor institution/lastSyncedAt para o frontend', async () => {
    const updatedAt = Timestamp.fromDate(new Date('2026-07-20T10:00:00Z'));
    mockAccountsGet.mockResolvedValueOnce({
      docs: [
        {
          data: () =>
            makeAccountDoc({
              type: 'CREDIT',
              pluggyItemId: 'item-001',
              updatedAt,
              creditData: {
                creditLimit: 5000,
                availableCreditLimit: 3200,
                balanceCloseDate: '2026-08-01',
                balanceDueDate: '2026-08-10',
              },
            }),
        },
      ],
    });
    mockPluggyItemsGet.mockResolvedValueOnce({
      docs: [{ data: () => makePluggyItemDoc({ pluggyItemId: 'item-001', connectorName: 'Nubank' }) }],
    });

    const res = await request(app)
      .get('/accounts')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.accounts[0]).toMatchObject({
      creditLimit: 5000,
      creditAvailableLimit: 3200,
      creditBillDueDate: '2026-08-10',
      institution: 'Nubank',
      lastSyncedAt: '2026-07-20T10:00:00.000Z',
    });
  });

  it('deve omitir campos de crédito quando a conta não tem creditData', async () => {
    mockAccountsGet.mockResolvedValueOnce({
      docs: [{ data: () => makeAccountDoc({ pluggyItemId: 'item-001' }) }],
    });
    mockPluggyItemsGet.mockResolvedValueOnce({
      docs: [{ data: () => makePluggyItemDoc({ pluggyItemId: 'item-001' }) }],
    });

    const res = await request(app)
      .get('/accounts')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.accounts[0].creditLimit).toBeUndefined();
    expect(res.body.accounts[0].creditAvailableLimit).toBeUndefined();
    expect(res.body.accounts[0].creditBillDueDate).toBeUndefined();
  });

  it('deve retornar 500 quando o Firestore falha', async () => {
    mockAccountsGet.mockRejectedValueOnce(new Error('Firestore unavailable'));
    mockPluggyItemsGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(app)
      .get('/accounts')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(500);
  });
});
