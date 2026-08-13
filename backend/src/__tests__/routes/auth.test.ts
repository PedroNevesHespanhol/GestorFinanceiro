// ─── Mocks (before any imports) ───────────────────────────────────────────────

const mockVerifyIdToken = jest.fn();
const mockUpsertUser = jest.fn();
const mockGetUser = jest.fn();

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: jest.fn(() => ({ seconds: 1234567890, nanoseconds: 0 })),
    fromDate: jest.fn((d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 })),
  },
}));

jest.mock('../../config/firebase', () => ({
  db: {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
      }),
    }),
  },
  auth: {
    verifyIdToken: mockVerifyIdToken,
  },
}));

jest.mock('../../services/firestore', () => ({
  upsertUser: mockUpsertUser,
  getUser: mockGetUser,
  collections: {},
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import express from 'express';
import request from 'supertest';
import authRoutes from '../../routes/auth';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  return app;
}

// ─── Test data ────────────────────────────────────────────────────────────────

const mockDecodedToken = {
  uid: 'firebase-uid-001',
  email: 'user@example.com',
  name: 'Test User',
  firebase: {
    identities: {
      'google.com': ['google-id-001'],
    },
  },
};

const mockUserDoc = {
  id: 'firebase-uid-001',
  email: 'user@example.com',
  name: 'Test User',
  googleId: 'google-id-001',
  createdAt: { seconds: 1234567890, nanoseconds: 0 },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /auth/google', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  it('deve criar/atualizar usuário no Firestore e retornar 200 com token válido', async () => {
    mockVerifyIdToken.mockResolvedValueOnce(mockDecodedToken);
    mockUpsertUser.mockResolvedValueOnce(mockUserDoc);

    const res = await request(app)
      .post('/auth/google')
      .send({ idToken: 'valid-firebase-id-token' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toMatchObject({
      id: 'firebase-uid-001',
      email: 'user@example.com',
    });

    expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-firebase-id-token');
    expect(mockUpsertUser).toHaveBeenCalledWith('firebase-uid-001', {
      email: 'user@example.com',
      name: 'Test User',
      googleId: 'google-id-001',
    });
  });

  it('deve retornar 422 quando idToken não é fornecido', async () => {
    const res = await request(app)
      .post('/auth/google')
      .send({});

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });

  it('deve retornar 500 quando Firebase rejeita o token', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('Token expired'));

    const res = await request(app)
      .post('/auth/google')
      .send({ idToken: 'expired-token' });

    // express default error handler returns 500 for unhandled errors
    expect(res.status).toBe(500);
  });
});

describe('GET /auth/me', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  it('deve retornar dados do usuário com token válido', async () => {
    mockVerifyIdToken.mockResolvedValueOnce(mockDecodedToken);
    mockGetUser.mockResolvedValueOnce(mockUserDoc);

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toMatchObject({ id: 'firebase-uid-001' });
  });

  it('deve retornar 401 sem Authorization header', async () => {
    const res = await request(app).get('/auth/me');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('deve retornar 401 com token Bearer inválido', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('auth/invalid-id-token'));

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });

  it('deve retornar 404 quando usuário não existe no Firestore', async () => {
    mockVerifyIdToken.mockResolvedValueOnce(mockDecodedToken);
    mockGetUser.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'User not found');
  });
});
