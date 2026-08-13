// ─── Mocks (must be declared before imports) ──────────────────────────────────

const mockVerifyIdToken = jest.fn();

// `transactions.ts` does `data.date instanceof Timestamp`, so the mock must be
// a real class (not a plain object) for `instanceof` to work.
jest.mock('firebase-admin/firestore', () => {
  class Timestamp {
    seconds: number;
    nanoseconds: number;
    constructor(seconds: number, nanoseconds: number) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    toDate() {
      return new Date(this.seconds * 1000);
    }
    static now() {
      return new Timestamp(Math.floor(Date.now() / 1000), 0);
    }
    static fromDate(d: Date) {
      return new Timestamp(Math.floor(d.getTime() / 1000), 0);
    }
  }
  return { Timestamp };
});

jest.mock('../../config/firebase', () => ({
  db: {},
  auth: { verifyIdToken: mockVerifyIdToken },
}));

const mockTxWhere = jest.fn();
const mockTxOrderBy = jest.fn();
const mockTxLimit = jest.fn();
const mockTxGet = jest.fn();
const txQuery = {
  where: mockTxWhere,
  orderBy: mockTxOrderBy,
  limit: mockTxLimit,
  get: mockTxGet,
};
mockTxWhere.mockReturnValue(txQuery);
mockTxOrderBy.mockReturnValue(txQuery);
mockTxLimit.mockReturnValue(txQuery);

const mockTxRefGet = jest.fn();
const mockTxRefUpdate = jest.fn();
const txDocRef = { id: 'tx-001', get: mockTxRefGet, update: mockTxRefUpdate };

jest.mock('../../services/firestore', () => ({
  collections: {
    transactions: jest.fn(() => txQuery),
    transaction: jest.fn(() => txDocRef),
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import express from 'express';
import request from 'supertest';
import { Timestamp } from 'firebase-admin/firestore';
import transactionsRoutes from '../../routes/transactions';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/transactions', transactionsRoutes);
  return app;
}

function makeTxDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-001',
    pluggyTransactionId: 'pluggy-tx-001',
    accountId: 'acc-001',
    description: 'Compra genérica',
    amount: -100,
    date: Timestamp.fromDate(new Date('2026-07-10T12:00:00')),
    type: 'DEBIT',
    category: 'Outros',
    syncedAt: Timestamp.fromDate(new Date('2026-07-10T12:00:00')),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /transactions', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTxWhere.mockReturnValue(txQuery);
    mockTxOrderBy.mockReturnValue(txQuery);
    mockTxLimit.mockReturnValue(txQuery);
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'user@test.com' });
    app = buildApp();
  });

  it('deve retornar 401 sem Authorization header', async () => {
    const res = await request(app).get('/transactions');
    expect(res.status).toBe(401);
  });

  it('deve listar transações ordenadas por data quando não há filtros de igualdade', async () => {
    mockTxGet.mockResolvedValueOnce({ docs: [{ data: () => makeTxDoc() }] });

    const res = await request(app)
      .get('/transactions')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0].date).toBe('2026-07-10T15:00:00.000Z');
    expect(mockTxOrderBy).toHaveBeenCalledWith('date', 'desc');
  });

  it('deve filtrar por accountId sem usar orderBy (ordenação em memória)', async () => {
    mockTxGet.mockResolvedValueOnce({
      docs: [{ data: () => makeTxDoc({ accountId: 'acc-002' }) }],
    });

    const res = await request(app)
      .get('/transactions?accountId=acc-002')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockTxWhere).toHaveBeenCalledWith('accountId', '==', 'acc-002');
    expect(mockTxOrderBy).not.toHaveBeenCalled();
  });

  it('deve filtrar por category', async () => {
    mockTxGet.mockResolvedValueOnce({
      docs: [{ data: () => makeTxDoc({ category: 'Alimentação' }) }],
    });

    const res = await request(app)
      .get('/transactions?category=Alimenta%C3%A7%C3%A3o')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockTxWhere).toHaveBeenCalledWith('category', '==', 'Alimentação');
  });

  it('deve aplicar filtros de data via where quando não há filtro de igualdade', async () => {
    mockTxGet.mockResolvedValueOnce({ docs: [] });

    const res = await request(app)
      .get('/transactions?dateFrom=2026-07-01&dateTo=2026-07-31')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockTxWhere).toHaveBeenCalledWith('date', '>=', expect.any(Timestamp));
    expect(mockTxWhere).toHaveBeenCalledWith('date', '<=', expect.any(Timestamp));
  });

  it('deve filtrar por data em memória quando combinado com filtro de igualdade', async () => {
    mockTxGet.mockResolvedValueOnce({
      docs: [
        { data: () => makeTxDoc({ accountId: 'acc-002', date: Timestamp.fromDate(new Date('2026-06-01T12:00:00')) }) },
        { data: () => makeTxDoc({ accountId: 'acc-002', date: Timestamp.fromDate(new Date('2026-07-15T12:00:00')) }) },
      ],
    });

    const res = await request(app)
      .get('/transactions?accountId=acc-002&dateFrom=2026-07-01&dateTo=2026-07-31')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(1);
  });

  it('deve filtrar por tags em memória', async () => {
    mockTxGet.mockResolvedValueOnce({
      docs: [
        { data: () => makeTxDoc({ id: 'tx-001', tags: ['viagem'] }) },
        { data: () => makeTxDoc({ id: 'tx-002', tags: ['mercado'] }) },
      ],
    });

    const res = await request(app)
      .get('/transactions?tags=viagem')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0].id).toBe('tx-001');
  });

  it('deve retornar 422 quando dateFrom não é ISO8601', async () => {
    const res = await request(app)
      .get('/transactions?dateFrom=not-a-date')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(422);
  });
});

describe('POST /transactions/:id', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'user@test.com' });
    app = buildApp();
  });

  it('deve retornar 401 sem Authorization header', async () => {
    const res = await request(app).post('/transactions/tx-001').send({ notes: 'nota' });
    expect(res.status).toBe(401);
  });

  it('deve atualizar anotações do usuário em uma transação existente', async () => {
    mockTxRefGet
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({ data: () => makeTxDoc({ userCategory: 'Lazer', notes: 'nota' }) });
    mockTxRefUpdate.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/transactions/tx-001')
      .set('Authorization', 'Bearer valid-token')
      .send({ userCategory: 'Lazer', notes: 'nota', tags: ['viagem'] });

    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({ userCategory: 'Lazer', notes: 'nota' });
    expect(mockTxRefUpdate).toHaveBeenCalledWith({
      userCategory: 'Lazer',
      tags: ['viagem'],
      notes: 'nota',
    });
  });

  it('deve retornar 404 quando a transação não existe', async () => {
    mockTxRefGet.mockResolvedValueOnce({ exists: false });

    const res = await request(app)
      .post('/transactions/tx-999')
      .set('Authorization', 'Bearer valid-token')
      .send({ notes: 'nota' });

    expect(res.status).toBe(404);
  });

  it('deve retornar 422 quando tags não é um array', async () => {
    const res = await request(app)
      .post('/transactions/tx-001')
      .set('Authorization', 'Bearer valid-token')
      .send({ tags: 'not-an-array' });

    expect(res.status).toBe(422);
  });
});
