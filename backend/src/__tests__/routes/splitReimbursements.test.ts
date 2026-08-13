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

const mockSplitDoc = jest.fn();
const mockSplitOrderBy = jest.fn();
const mockSplitGet = jest.fn();
const splitQuery = { doc: mockSplitDoc, orderBy: mockSplitOrderBy };
mockSplitOrderBy.mockReturnValue({ get: mockSplitGet });

const mockSplitRefGet = jest.fn();
const mockSplitRefUpdate = jest.fn();
const mockSplitRefSet = jest.fn();
const mockSplitRefDelete = jest.fn();
const splitDocRef = {
  id: 'split-001',
  get: mockSplitRefGet,
  update: mockSplitRefUpdate,
  set: mockSplitRefSet,
  delete: mockSplitRefDelete,
};

jest.mock('../../services/firestore', () => ({
  collections: {
    splitReimbursements: jest.fn(() => splitQuery),
    splitReimbursement: jest.fn(() => splitDocRef),
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import express from 'express';
import request from 'supertest';
import splitReimbursementsRoutes from '../../routes/splitReimbursements';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/split-reimbursements', splitReimbursementsRoutes);
  return app;
}

function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-001',
    name: 'Amigo',
    amount: 50,
    settled: false,
    ...overrides,
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Jantar',
    totalAmount: 100,
    date: '2026-07-01T12:00:00.000Z',
    paidBy: 'user-001',
    participants: [makeParticipant()],
    ...overrides,
  };
}

function makeSplitDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'split-001',
    description: 'Jantar',
    totalAmount: 100,
    currency: 'BRL',
    date: { seconds: 1234567890, nanoseconds: 0 },
    participants: [makeParticipant()],
    status: 'PENDING',
    paidBy: 'user-001',
    createdAt: { seconds: 1234567890, nanoseconds: 0 },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /split-reimbursements', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSplitDoc.mockReturnValue(splitDocRef);
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'user@test.com' });
    app = buildApp();
  });

  it('deve retornar 401 sem Authorization header', async () => {
    const res = await request(app).post('/split-reimbursements').send(validBody());
    expect(res.status).toBe(401);
  });

  it('deve criar um split com status PENDING quando nenhum participante está settled', async () => {
    mockSplitRefSet.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/split-reimbursements')
      .set('Authorization', 'Bearer valid-token')
      .send(validBody());

    expect(res.status).toBe(201);
    expect(res.body.splitReimbursement).toMatchObject({ status: 'PENDING' });
  });

  it('deve criar um split com status SETTLED quando todos os participantes estão settled', async () => {
    mockSplitRefSet.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/split-reimbursements')
      .set('Authorization', 'Bearer valid-token')
      .send(validBody({ participants: [makeParticipant({ settled: true })] }));

    expect(res.status).toBe(201);
    expect(res.body.splitReimbursement).toMatchObject({ status: 'SETTLED' });
  });

  it('deve criar um split com status PARTIALLY_SETTLED quando parte dos participantes está settled', async () => {
    mockSplitRefSet.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/split-reimbursements')
      .set('Authorization', 'Bearer valid-token')
      .send(
        validBody({
          participants: [
            makeParticipant({ id: 'p-001', settled: true }),
            makeParticipant({ id: 'p-002', settled: false }),
          ],
        })
      );

    expect(res.status).toBe(201);
    expect(res.body.splitReimbursement).toMatchObject({ status: 'PARTIALLY_SETTLED' });
  });

  it('deve retornar 422 quando participants está vazio', async () => {
    const res = await request(app)
      .post('/split-reimbursements')
      .set('Authorization', 'Bearer valid-token')
      .send(validBody({ participants: [] }));

    expect(res.status).toBe(422);
  });
});

describe('GET /split-reimbursements', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'user@test.com' });
    app = buildApp();
  });

  it('deve retornar 401 sem Authorization header', async () => {
    const res = await request(app).get('/split-reimbursements');
    expect(res.status).toBe(401);
  });

  it('deve listar splits ordenados por data', async () => {
    mockSplitGet.mockResolvedValueOnce({ docs: [{ data: () => makeSplitDoc() }] });

    const res = await request(app)
      .get('/split-reimbursements')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.splitReimbursements).toHaveLength(1);
    expect(mockSplitOrderBy).toHaveBeenCalledWith('date', 'asc');
  });
});

describe('PUT /split-reimbursements/:id', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'user@test.com' });
    app = buildApp();
  });

  it('deve atualizar um split existente e recalcular o status', async () => {
    mockSplitRefGet
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({ data: () => makeSplitDoc({ status: 'SETTLED' }) });
    mockSplitRefUpdate.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .put('/split-reimbursements/split-001')
      .set('Authorization', 'Bearer valid-token')
      .send({ participants: [makeParticipant({ settled: true })] });

    expect(res.status).toBe(200);
    expect(mockSplitRefUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SETTLED' })
    );
  });

  it('deve retornar 404 ao atualizar split inexistente', async () => {
    mockSplitRefGet.mockResolvedValueOnce({ exists: false });

    const res = await request(app)
      .put('/split-reimbursements/split-999')
      .set('Authorization', 'Bearer valid-token')
      .send({ totalAmount: 200 });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /split-reimbursements/:id', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'user@test.com' });
    app = buildApp();
  });

  it('deve deletar um split existente', async () => {
    mockSplitRefGet.mockResolvedValueOnce({ exists: true });
    mockSplitRefDelete.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .delete('/split-reimbursements/split-001')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(204);
  });

  it('deve retornar 404 ao deletar split inexistente', async () => {
    mockSplitRefGet.mockResolvedValueOnce({ exists: false });

    const res = await request(app)
      .delete('/split-reimbursements/split-999')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });
});
