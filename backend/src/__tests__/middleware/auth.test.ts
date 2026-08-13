// ─── Mocks (before any imports) ───────────────────────────────────────────────

const mockVerifyIdToken = jest.fn();

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: jest.fn(() => ({ seconds: 1234567890, nanoseconds: 0 })),
  },
}));

jest.mock('../../config/firebase', () => ({
  db: {},
  auth: {
    verifyIdToken: mockVerifyIdToken,
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function makeMockNext(): NextFunction {
  return jest.fn() as NextFunction;
}

function makeRequest(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as Request;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve chamar next() e injetar userId na req com Bearer token válido', async () => {
    const decodedToken = { uid: 'user-001', email: 'user@example.com' };
    mockVerifyIdToken.mockResolvedValueOnce(decodedToken);

    const req = makeRequest('Bearer valid-token');
    const res = makeMockResponse();
    const next = makeMockNext();

    await authMiddleware(req, res, next);

    expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token');
    expect((req as AuthenticatedRequest).userId).toBe('user-001');
    expect((req as AuthenticatedRequest).userEmail).toBe('user@example.com');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // called with no arguments
  });

  it('deve injetar userEmail vazio quando email não está no token', async () => {
    const decodedToken = { uid: 'user-002' }; // no email field
    mockVerifyIdToken.mockResolvedValueOnce(decodedToken);

    const req = makeRequest('Bearer some-token');
    const res = makeMockResponse();
    const next = makeMockNext();

    await authMiddleware(req, res, next);

    expect((req as AuthenticatedRequest).userId).toBe('user-002');
    expect((req as AuthenticatedRequest).userEmail).toBe('');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('deve retornar 401 sem Authorization header', async () => {
    const req = makeRequest(); // no header
    const res = makeMockResponse();
    const next = makeMockNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing or invalid Authorization header',
    });
    expect(next).not.toHaveBeenCalled();
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('deve retornar 401 quando header não começa com Bearer', async () => {
    const req = makeRequest('Basic abc123');
    const res = makeMockResponse();
    const next = makeMockNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing or invalid Authorization header',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar 401 com token inválido (Firebase rejeita)', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('auth/invalid-id-token'));

    const req = makeRequest('Bearer invalid-token');
    const res = makeMockResponse();
    const next = makeMockNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid or expired token',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar 401 com token expirado', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('auth/id-token-expired'));

    const req = makeRequest('Bearer expired-token');
    const res = makeMockResponse();
    const next = makeMockNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid or expired token',
    });
  });
});
