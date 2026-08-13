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

const mockFixedExpensesDoc = jest.fn();
const mockFixedExpensesOrderBy = jest.fn();
const mockFixedExpensesGet = jest.fn();
const fixedExpensesQuery = { doc: mockFixedExpensesDoc, orderBy: mockFixedExpensesOrderBy };
mockFixedExpensesOrderBy.mockReturnValue({ get: mockFixedExpensesGet });

const mockFixedExpenseRefGet = jest.fn();
const mockFixedExpenseRefUpdate = jest.fn();
const mockFixedExpenseRefSet = jest.fn();
const mockFixedExpenseRefDelete = jest.fn();
const fixedExpenseDocRef = {
  id: 'exp-001',
  get: mockFixedExpenseRefGet,
  update: mockFixedExpenseRefUpdate,
  set: mockFixedExpenseRefSet,
  delete: mockFixedExpenseRefDelete,
};

const mockRecurringIncomeDoc = jest.fn();
const mockRecurringIncomeOrderBy = jest.fn();
const mockRecurringIncomeGet = jest.fn();
const recurringIncomeQuery = { doc: mockRecurringIncomeDoc, orderBy: mockRecurringIncomeOrderBy };
mockRecurringIncomeOrderBy.mockReturnValue({ get: mockRecurringIncomeGet });

const mockRecurringIncomeRefGet = jest.fn();
const mockRecurringIncomeRefUpdate = jest.fn();
const mockRecurringIncomeRefSet = jest.fn();
const mockRecurringIncomeRefDelete = jest.fn();
const recurringIncomeDocRef = {
  id: 'inc-001',
  get: mockRecurringIncomeRefGet,
  update: mockRecurringIncomeRefUpdate,
  set: mockRecurringIncomeRefSet,
  delete: mockRecurringIncomeRefDelete,
};

jest.mock('../../services/firestore', () => ({
  collections: {
    fixedExpenses: jest.fn(() => fixedExpensesQuery),
    fixedExpense: jest.fn(() => fixedExpenseDocRef),
    recurringIncome: jest.fn(() => recurringIncomeQuery),
    recurringIncomeDoc: jest.fn(() => recurringIncomeDocRef),
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import express from 'express';
import request from 'supertest';
import expensesRoutes from '../../routes/expenses';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', expensesRoutes);
  return app;
}

const validFixedExpense = {
  name: 'Aluguel',
  amount: 1500,
  frequency: 'MONTHLY',
  category: 'Moradia',
};

const validRecurringIncome = {
  name: 'Salário',
  amount: 5000,
  frequency: 'MONTHLY',
  category: 'Trabalho',
};

function makeFixedExpenseDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exp-001',
    name: 'Aluguel',
    amount: 1500,
    frequency: 'MONTHLY',
    category: 'Moradia',
    active: true,
    createdAt: { seconds: 1234567890, nanoseconds: 0 },
    ...overrides,
  };
}

function makeRecurringIncomeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inc-001',
    name: 'Salário',
    amount: 5000,
    frequency: 'MONTHLY',
    category: 'Trabalho',
    active: true,
    createdAt: { seconds: 1234567890, nanoseconds: 0 },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Fixed Expenses', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFixedExpensesDoc.mockReturnValue(fixedExpenseDocRef);
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'user@test.com' });
    app = buildApp();
  });

  it('deve retornar 401 sem Authorization header', async () => {
    const res = await request(app).get('/fixed-expenses');
    expect(res.status).toBe(401);
  });

  it('deve criar uma despesa fixa e retornar 201', async () => {
    mockFixedExpenseRefSet.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/fixed-expenses')
      .set('Authorization', 'Bearer valid-token')
      .send(validFixedExpense);

    expect(res.status).toBe(201);
    expect(res.body.fixedExpense).toMatchObject({ id: 'exp-001', name: 'Aluguel', active: true });
    expect(mockFixedExpenseRefSet).toHaveBeenCalled();
  });

  it('deve retornar 422 ao criar despesa fixa com dados inválidos', async () => {
    const res = await request(app)
      .post('/fixed-expenses')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: '', amount: -10, frequency: 'DAILY', category: '' });

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });

  it('deve listar despesas fixas', async () => {
    mockFixedExpensesGet.mockResolvedValueOnce({
      docs: [{ data: () => makeFixedExpenseDoc() }],
    });

    const res = await request(app)
      .get('/fixed-expenses')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.fixedExpenses).toHaveLength(1);
    expect(mockFixedExpensesOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
  });

  it('deve atualizar uma despesa fixa existente', async () => {
    mockFixedExpenseRefGet
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({ data: () => makeFixedExpenseDoc({ amount: 2000 }) });
    mockFixedExpenseRefUpdate.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .put('/fixed-expenses/exp-001')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: 2000 });

    expect(res.status).toBe(200);
    expect(res.body.fixedExpense).toMatchObject({ amount: 2000 });
    expect(mockFixedExpenseRefUpdate).toHaveBeenCalledWith({ amount: 2000 });
  });

  it('deve retornar 404 ao atualizar despesa fixa inexistente', async () => {
    mockFixedExpenseRefGet.mockResolvedValueOnce({ exists: false });

    const res = await request(app)
      .put('/fixed-expenses/exp-999')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: 2000 });

    expect(res.status).toBe(404);
  });

  it('deve retornar 422 ao atualizar despesa fixa com valores inválidos', async () => {
    const res = await request(app)
      .put('/fixed-expenses/exp-001')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: -5 });

    expect(res.status).toBe(422);
  });

  it('deve deletar uma despesa fixa existente', async () => {
    mockFixedExpenseRefGet.mockResolvedValueOnce({ exists: true });
    mockFixedExpenseRefDelete.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .delete('/fixed-expenses/exp-001')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(204);
    expect(mockFixedExpenseRefDelete).toHaveBeenCalled();
  });

  it('deve retornar 404 ao deletar despesa fixa inexistente', async () => {
    mockFixedExpenseRefGet.mockResolvedValueOnce({ exists: false });

    const res = await request(app)
      .delete('/fixed-expenses/exp-999')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });
});

describe('Recurring Income', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRecurringIncomeDoc.mockReturnValue(recurringIncomeDocRef);
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'user@test.com' });
    app = buildApp();
  });

  it('deve retornar 401 sem Authorization header', async () => {
    const res = await request(app).get('/recurring-income');
    expect(res.status).toBe(401);
  });

  it('deve criar uma receita recorrente e retornar 201', async () => {
    mockRecurringIncomeRefSet.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/recurring-income')
      .set('Authorization', 'Bearer valid-token')
      .send(validRecurringIncome);

    expect(res.status).toBe(201);
    expect(res.body.recurringIncome).toMatchObject({ id: 'inc-001', name: 'Salário', active: true });
  });

  it('deve retornar 422 ao criar receita recorrente com dados inválidos', async () => {
    const res = await request(app)
      .post('/recurring-income')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: '', amount: 0, frequency: 'DAILY', category: '' });

    expect(res.status).toBe(422);
  });

  it('deve listar receitas recorrentes', async () => {
    mockRecurringIncomeGet.mockResolvedValueOnce({
      docs: [{ data: () => makeRecurringIncomeDoc() }],
    });

    const res = await request(app)
      .get('/recurring-income')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.recurringIncome).toHaveLength(1);
  });

  it('deve atualizar uma receita recorrente existente', async () => {
    mockRecurringIncomeRefGet
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({ data: () => makeRecurringIncomeDoc({ amount: 6000 }) });
    mockRecurringIncomeRefUpdate.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .put('/recurring-income/inc-001')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: 6000 });

    expect(res.status).toBe(200);
    expect(res.body.recurringIncome).toMatchObject({ amount: 6000 });
  });

  it('deve retornar 404 ao atualizar receita recorrente inexistente', async () => {
    mockRecurringIncomeRefGet.mockResolvedValueOnce({ exists: false });

    const res = await request(app)
      .put('/recurring-income/inc-999')
      .set('Authorization', 'Bearer valid-token')
      .send({ amount: 6000 });

    expect(res.status).toBe(404);
  });

  it('deve deletar uma receita recorrente existente', async () => {
    mockRecurringIncomeRefGet.mockResolvedValueOnce({ exists: true });
    mockRecurringIncomeRefDelete.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .delete('/recurring-income/inc-001')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(204);
  });

  it('deve retornar 404 ao deletar receita recorrente inexistente', async () => {
    mockRecurringIncomeRefGet.mockResolvedValueOnce({ exists: false });

    const res = await request(app)
      .delete('/recurring-income/inc-999')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });
});
