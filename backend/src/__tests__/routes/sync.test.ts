// ─── Mocks (must be declared before imports) ──────────────────────────────────

const mockVerifyIdToken = jest.fn();

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: jest.fn(() => ({ seconds: 1234567890, nanoseconds: 0 })),
    fromDate: jest.fn((d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 })),
  },
}));

jest.mock('../../config/firebase', () => ({
  db: {},
  auth: { verifyIdToken: mockVerifyIdToken },
}));

const mockCreateConnectToken = jest.fn();
const mockFetchItem = jest.fn();

jest.mock('../../services/pluggy', () => ({
  createConnectToken: mockCreateConnectToken,
  pluggyClient: { fetchItem: mockFetchItem },
}));

const mockSyncAllUserItems = jest.fn();
const mockSyncPluggyItem = jest.fn();

jest.mock('../../services/sync', () => ({
  syncAllUserItems: mockSyncAllUserItems,
  syncPluggyItem: mockSyncPluggyItem,
}));

const mockSyncLogsOrderBy = jest.fn();
const mockSyncLogsLimit = jest.fn();
const mockSyncLogsGet = jest.fn();
const syncLogsQuery = { orderBy: mockSyncLogsOrderBy };
mockSyncLogsOrderBy.mockReturnValue({ limit: mockSyncLogsLimit });
mockSyncLogsLimit.mockReturnValue({ get: mockSyncLogsGet });

const mockPluggyItemDocSet = jest.fn();
const pluggyItemDocRef = { set: mockPluggyItemDocSet };
const mockPluggyItemsDoc = jest.fn(() => pluggyItemDocRef);
const pluggyItemsQuery = { doc: mockPluggyItemsDoc };

jest.mock('../../services/firestore', () => ({
  collections: {
    syncLogs: jest.fn(() => syncLogsQuery),
    pluggyItems: jest.fn(() => pluggyItemsQuery),
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import express from 'express';
import request from 'supertest';
import syncRoutes from '../../routes/sync';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', syncRoutes);
  return app;
}

function flushSetImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /pluggy/connect-token', () => {
  let app: express.Application;
  const originalWebhookBaseUrl = process.env.WEBHOOK_BASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'user@test.com' });
    app = buildApp();
  });

  afterEach(() => {
    process.env.WEBHOOK_BASE_URL = originalWebhookBaseUrl;
  });

  it('deve retornar 401 sem Authorization header', async () => {
    const res = await request(app).post('/pluggy/connect-token');
    expect(res.status).toBe(401);
  });

  it('deve retornar um accessToken e propagar o webhookUrl quando WEBHOOK_BASE_URL é https', async () => {
    process.env.WEBHOOK_BASE_URL = 'https://example.com';
    mockCreateConnectToken.mockResolvedValueOnce('connect-token-abc');

    const res = await request(app)
      .post('/pluggy/connect-token')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accessToken: 'connect-token-abc' });
    expect(mockCreateConnectToken).toHaveBeenCalledWith({
      clientUserId: 'user-001',
      webhookUrl: 'https://example.com/webhook',
    });
  });

  it('não deve propagar webhookUrl quando WEBHOOK_BASE_URL não é https', async () => {
    delete process.env.WEBHOOK_BASE_URL;
    mockCreateConnectToken.mockResolvedValueOnce('connect-token-abc');

    const res = await request(app)
      .post('/pluggy/connect-token')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockCreateConnectToken).toHaveBeenCalledWith({
      clientUserId: 'user-001',
      webhookUrl: undefined,
    });
  });
});

describe('GET /sync/logs', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSyncLogsOrderBy.mockReturnValue({ limit: mockSyncLogsLimit });
    mockSyncLogsLimit.mockReturnValue({ get: mockSyncLogsGet });
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'user@test.com' });
    app = buildApp();
  });

  it('deve retornar 401 sem Authorization header', async () => {
    const res = await request(app).get('/sync/logs');
    expect(res.status).toBe(401);
  });

  it('deve retornar os últimos logs de sincronização formatados', async () => {
    mockSyncLogsGet.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            id: 'log-001',
            pluggyItemId: 'item-001',
            status: 'SUCCESS',
            transactionsSynced: 5,
            accountsSynced: 1,
            syncedAt: { toDate: () => new Date('2026-07-15T12:00:00Z') },
            duration: 1200,
          }),
        },
      ],
    });

    const res = await request(app)
      .get('/sync/logs')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0]).toMatchObject({
      id: 'log-001',
      status: 'SUCCESS',
      syncedAt: '2026-07-15T12:00:00.000Z',
    });
    expect(mockSyncLogsOrderBy).toHaveBeenCalledWith('syncedAt', 'desc');
    expect(mockSyncLogsLimit).toHaveBeenCalledWith(50);
  });
});

describe('POST /sync', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'user@test.com' });
    app = buildApp();
  });

  it('deve retornar 401 sem Authorization header', async () => {
    const res = await request(app).post('/sync');
    expect(res.status).toBe(401);
  });

  it('deve agregar os resultados de sincronização de todos os itens', async () => {
    mockSyncAllUserItems.mockResolvedValueOnce([
      { accountsSynced: 2, transactionsSynced: 10, errors: [] },
      { accountsSynced: 1, transactionsSynced: 3, errors: ['falha ao sincronizar item-002'] },
    ]);

    const res = await request(app)
      .post('/sync')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      itemsSynced: 2,
      accountsSynced: 3,
      transactionsSynced: 13,
      errors: ['falha ao sincronizar item-002'],
    });
  });
});

describe('POST /pluggy/items', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPluggyItemsDoc.mockReturnValue(pluggyItemDocRef);
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'user@test.com' });
    app = buildApp();
  });

  it('deve retornar 401 sem Authorization header', async () => {
    const res = await request(app).post('/pluggy/items').send({ itemId: 'item-001' });
    expect(res.status).toBe(401);
  });

  it('deve retornar 422 quando itemId não é fornecido', async () => {
    const res = await request(app)
      .post('/pluggy/items')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(422);
  });

  it('deve salvar o item e disparar sincronização em background', async () => {
    mockFetchItem.mockResolvedValueOnce({
      connector: { id: 5, name: 'Banco Teste' },
    });
    mockPluggyItemDocSet.mockResolvedValueOnce(undefined);
    mockSyncPluggyItem.mockResolvedValueOnce({ accountsSynced: 1, transactionsSynced: 2, errors: [] });

    const res = await request(app)
      .post('/pluggy/items')
      .set('Authorization', 'Bearer valid-token')
      .send({ itemId: 'item-001' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ itemId: 'item-001', status: 'syncing' });
    expect(mockPluggyItemDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ pluggyItemId: 'item-001', connectorId: 5, connectorName: 'Banco Teste' }),
      { merge: true }
    );

    await flushSetImmediate();
    expect(mockSyncPluggyItem).toHaveBeenCalledWith('user-001', 'item-001');
  });

  it('deve retornar 500 quando a busca do item no Pluggy falha', async () => {
    mockFetchItem.mockRejectedValueOnce(new Error('Pluggy API error'));

    const res = await request(app)
      .post('/pluggy/items')
      .set('Authorization', 'Bearer valid-token')
      .send({ itemId: 'item-001' });

    expect(res.status).toBe(500);
  });
});
