// ─── Mocks (must be declared before imports) ──────────────────────────────────

const mockFindUserIdByPluggyItemId = jest.fn();
const mockSyncPluggyItem = jest.fn();
const mockSyncLogDocSet = jest.fn();
const mockSyncLogDocRef = { id: 'log-id', set: mockSyncLogDocSet };
const mockPluggyItemsWhere = jest.fn();
const mockPluggyItemsGet = jest.fn();
const mockPluggyItemsUpdate = jest.fn();
const mockPluggyItemsLimit = jest.fn();

mockPluggyItemsWhere.mockReturnValue({ limit: mockPluggyItemsLimit });
mockPluggyItemsLimit.mockReturnValue({ get: mockPluggyItemsGet });

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: jest.fn(() => ({ seconds: 1234567890, nanoseconds: 0 })),
    fromDate: jest.fn((d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 })),
  },
}));

jest.mock('../../services/sync', () => ({
  findUserIdByPluggyItemId: mockFindUserIdByPluggyItemId,
  syncPluggyItem: mockSyncPluggyItem,
}));

jest.mock('../../services/firestore', () => ({
  collections: {
    syncLogs: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue(mockSyncLogDocRef),
    }),
    pluggyItems: jest.fn().mockReturnValue({
      where: mockPluggyItemsWhere,
    }),
  },
}));

// Mock Firebase config — prevents real Firebase init
jest.mock('../../config/firebase', () => ({
  db: {},
  auth: { verifyIdToken: jest.fn() },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import express from 'express';
import request from 'supertest';
import webhookRoutes from '../../routes/webhook';

// Build a minimal Express app for the webhook route
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/webhook', webhookRoutes);
  return app;
}

// ─── Helper to wait for setImmediate callbacks ────────────────────────────────

function flushSetImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /webhook', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();

    // Re-apply chaining
    mockPluggyItemsWhere.mockReturnValue({ limit: mockPluggyItemsLimit });
    mockPluggyItemsLimit.mockReturnValue({ get: mockPluggyItemsGet });

    app = buildApp();
  });

  it('deve retornar 200 imediatamente para event item/updated', async () => {
    mockFindUserIdByPluggyItemId.mockResolvedValue('user-001');
    mockSyncPluggyItem.mockResolvedValue({
      accountsSynced: 1,
      transactionsSynced: 5,
      errors: [],
    });

    const res = await request(app)
      .post('/webhook')
      .send({ event: 'item/updated', itemId: 'item-001' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('deve chamar syncPluggyItem de forma assíncrona para event item/updated', async () => {
    mockFindUserIdByPluggyItemId.mockResolvedValue('user-001');
    mockSyncPluggyItem.mockResolvedValue({
      accountsSynced: 1,
      transactionsSynced: 5,
      errors: [],
    });

    await request(app)
      .post('/webhook')
      .send({ event: 'item/updated', itemId: 'item-001' });

    // Allow async setImmediate to flush
    await flushSetImmediate();

    expect(mockFindUserIdByPluggyItemId).toHaveBeenCalledWith('item-001');
    expect(mockSyncPluggyItem).toHaveBeenCalledWith('user-001', 'item-001');
  });

  it('deve chamar syncPluggyItem para event item/created', async () => {
    mockFindUserIdByPluggyItemId.mockResolvedValue('user-001');
    mockSyncPluggyItem.mockResolvedValue({
      accountsSynced: 1,
      transactionsSynced: 2,
      errors: [],
    });

    await request(app)
      .post('/webhook')
      .send({ event: 'item/created', itemId: 'item-001' });

    await flushSetImmediate();

    expect(mockSyncPluggyItem).toHaveBeenCalledWith('user-001', 'item-001');
  });

  it('deve escrever syncLog com status ERROR para event item/error', async () => {
    mockFindUserIdByPluggyItemId.mockResolvedValue('user-001');
    mockSyncLogDocSet.mockResolvedValue(undefined);
    mockPluggyItemsGet.mockResolvedValue({ empty: true, docs: [] });

    await request(app)
      .post('/webhook')
      .send({
        event: 'item/error',
        itemId: 'item-001',
        error: { code: 'INVALID_CREDENTIALS', message: 'Wrong password' },
      });

    await flushSetImmediate();

    expect(mockSyncLogDocSet).toHaveBeenCalledTimes(1);
    const logWritten = mockSyncLogDocSet.mock.calls[0][0] as Record<string, unknown>;
    expect(logWritten).toMatchObject({
      status: 'ERROR',
      pluggyItemId: 'item-001',
      errorMessage: 'Wrong password',
    });
  });

  it('deve retornar 400 quando body não tem itemId', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({ event: 'item/updated' }); // missing itemId

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Missing event or itemId');
  });

  it('deve retornar 400 quando body não tem event', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({ itemId: 'item-001' }); // missing event

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Missing event or itemId');
  });

  it('deve funcionar sem Authorization header (rota pública)', async () => {
    mockFindUserIdByPluggyItemId.mockResolvedValue('user-001');
    mockSyncPluggyItem.mockResolvedValue({ accountsSynced: 0, transactionsSynced: 0, errors: [] });

    const res = await request(app)
      .post('/webhook')
      .send({ event: 'item/updated', itemId: 'item-001' });
    // No Authorization header set
    expect(res.status).toBe(200);
  });

  it('não deve chamar syncPluggyItem quando userId não é encontrado', async () => {
    mockFindUserIdByPluggyItemId.mockResolvedValue(null);

    await request(app)
      .post('/webhook')
      .send({ event: 'item/updated', itemId: 'item-unknown' });

    await flushSetImmediate();

    expect(mockSyncPluggyItem).not.toHaveBeenCalled();
  });
});

describe('POST /webhook — validação do header secreto', () => {
  let app: express.Application;
  const originalSecret = process.env.PLUGGY_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PLUGGY_WEBHOOK_SECRET = 'super-secret';
    app = express();
    app.use(express.json());
    app.use('/webhook', webhookRoutes);
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.PLUGGY_WEBHOOK_SECRET;
    } else {
      process.env.PLUGGY_WEBHOOK_SECRET = originalSecret;
    }
  });

  it('deve retornar 401 quando o header secreto está ausente', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({ event: 'item/updated', itemId: 'item-001' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Invalid webhook secret');
    expect(mockFindUserIdByPluggyItemId).not.toHaveBeenCalled();
  });

  it('deve retornar 401 quando o header secreto está incorreto', async () => {
    const res = await request(app)
      .post('/webhook')
      .set('x-webhook-secret', 'wrong-secret')
      .send({ event: 'item/updated', itemId: 'item-001' });

    expect(res.status).toBe(401);
  });

  it('deve aceitar (200) quando o header secreto confere', async () => {
    mockFindUserIdByPluggyItemId.mockResolvedValue('user-001');
    mockSyncPluggyItem.mockResolvedValue({ accountsSynced: 0, transactionsSynced: 0, errors: [] });

    const res = await request(app)
      .post('/webhook')
      .set('x-webhook-secret', 'super-secret')
      .send({ event: 'item/updated', itemId: 'item-001' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
