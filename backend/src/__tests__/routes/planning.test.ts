// ─── Mocks (must be declared before imports) ──────────────────────────────────

const mockVerifyIdToken = jest.fn();

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: jest.fn(() => ({ seconds: 1234567890, nanoseconds: 0 })),
    fromDate: jest.fn((d: Date) => ({
      seconds: Math.floor(d.getTime() / 1000),
      nanoseconds: 0,
      toDate: () => d,
    })),
  },
}));

jest.mock('../../config/firebase', () => ({
  db: {},
  auth: { verifyIdToken: mockVerifyIdToken },
}));

const mockTxGet = jest.fn();
const txQuery = {
  where: jest.fn().mockReturnThis(),
  get: mockTxGet,
};

const mockFixedExpGet = jest.fn();
const fixedExpQuery = {
  where: jest.fn().mockReturnThis(),
  get: mockFixedExpGet,
};

const mockRecIncGet = jest.fn();
const recIncQuery = {
  where: jest.fn().mockReturnThis(),
  get: mockRecIncGet,
};

const mockAccountsGet = jest.fn();
const accountsQuery = {
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  get: mockAccountsGet,
};

const mockPluggyItemsGet = jest.fn();
const pluggyItemsQuery = {
  where: jest.fn().mockReturnThis(),
  get: mockPluggyItemsGet,
};

jest.mock('../../services/firestore', () => ({
  collections: {
    transactions: jest.fn(() => txQuery),
    fixedExpenses: jest.fn(() => fixedExpQuery),
    recurringIncome: jest.fn(() => recIncQuery),
    accounts: jest.fn(() => accountsQuery),
    pluggyItems: jest.fn(() => pluggyItemsQuery),
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import express from 'express';
import request from 'supertest';
import planningRoutes from '../../routes/planning';

// ─── Test helpers ──────────────────────────────────────────────────────────────
//
// "Now" is pinned to 2026-07-15 in every test (see beforeEach). The response
// window is a rolling 12 months starting at the current month, so:
//   idx 0 = Jul/2026 (current)  idx 4 = Nov/2026  idx  8 = Mar/2027
//   idx 1 = Aug/2026            idx 5 = Dez/2026  idx  9 = Abr/2027
//   idx 2 = Set/2026            idx 6 = Jan/2027  idx 10 = Mai/2027
//   idx 3 = Out/2026            idx 7 = Fev/2027  idx 11 = Jun/2027

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/planning', planningRoutes);
  return app;
}

function toTimestamp(date: Date) {
  return { toDate: () => date };
}

function makeTxDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-001',
    pluggyTransactionId: 'pluggy-tx-001',
    accountId: 'acc-001',
    description: 'Compra genérica',
    amount: -100,
    date: toTimestamp(new Date('2026-07-15T12:00:00')),
    type: 'DEBIT',
    category: 'Outros',
    syncedAt: toTimestamp(new Date('2026-07-15T12:00:00')),
    ...overrides,
  };
}

function makeFixedExpenseDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exp-001',
    name: 'Aluguel',
    amount: 100,
    frequency: 'MONTHLY',
    category: 'Moradia',
    active: true,
    createdAt: toTimestamp(new Date('2026-01-01T00:00:00')),
    ...overrides,
  };
}

function makeRecurringIncomeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inc-001',
    name: 'Salário',
    amount: 1000,
    frequency: 'MONTHLY',
    category: 'Trabalho',
    active: true,
    createdAt: toTimestamp(new Date('2026-01-01T00:00:00')),
    ...overrides,
  };
}

function makeAccountDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-001',
    pluggyAccountId: 'pluggy-acc-001',
    pluggyItemId: 'item-001',
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    name: 'Conta Corrente',
    number: '0001',
    balance: 0,
    currencyCode: 'BRL',
    updatedAt: toTimestamp(new Date('2026-01-01T00:00:00')),
    ...overrides,
  };
}

function makePluggyItemDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-001',
    pluggyItemId: 'item-001',
    connectorId: 1,
    connectorName: 'Nubank',
    status: 'UPDATED',
    lastUpdatedAt: toTimestamp(new Date('2026-01-01T00:00:00')),
    lastSyncAttempt: toTimestamp(new Date('2026-01-01T00:00:00')),
    webhookUrl: '',
    createdAt: toTimestamp(new Date('2026-01-01T00:00:00')),
    ...overrides,
  };
}

// windowTxs → transactions inside the visible 12-month window (first `transactions` call).
// lookbackTxs → transactions from up to a year before the window (second `transactions`
// call), used only to anchor installment purchases that started earlier.
function mockQueries(opts: {
  windowTxs?: Record<string, unknown>[];
  lookbackTxs?: Record<string, unknown>[];
  fixedExpenses?: Record<string, unknown>[];
  recurringIncome?: Record<string, unknown>[];
  accounts?: Record<string, unknown>[];
  pluggyItems?: Record<string, unknown>[];
}) {
  mockTxGet
    .mockResolvedValueOnce({ docs: (opts.windowTxs ?? []).map((d) => ({ data: () => d })) })
    .mockResolvedValueOnce({ docs: (opts.lookbackTxs ?? []).map((d) => ({ data: () => d })) });
  mockFixedExpGet.mockResolvedValueOnce({
    docs: (opts.fixedExpenses ?? []).map((d) => ({ data: () => d })),
  });
  mockRecIncGet.mockResolvedValueOnce({
    docs: (opts.recurringIncome ?? []).map((d) => ({ data: () => d })),
  });
  mockAccountsGet.mockResolvedValueOnce({
    docs: (opts.accounts ?? []).map((d) => ({ data: () => d })),
  });
  mockPluggyItemsGet.mockResolvedValueOnce({
    docs: (opts.pluggyItems ?? []).map((d) => ({ data: () => d })),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /planning/annual', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    // mockResolvedValueOnce queues survive clearAllMocks — drain them explicitly
    // so a test that doesn't consume its full queue can't leak into the next one.
    mockTxGet.mockReset();
    mockFixedExpGet.mockReset();
    mockRecIncGet.mockReset();
    mockAccountsGet.mockReset();
    mockPluggyItemsGet.mockReset();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T12:00:00'));
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-001', email: 'user@test.com' });
    app = buildApp();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('deve retornar 401 sem Authorization header', async () => {
    const res = await request(app).get('/planning/annual');
    expect(res.status).toBe(401);
  });

  it('a janela nunca inclui meses passados: por padrão começa no mês atual (Jul/2026)', async () => {
    mockQueries({});

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    const months = res.body.months;
    expect(months).toHaveLength(12);
    expect(months[0]).toMatchObject({ month: 7, year: 2026, isCurrent: true, isPast: false });
    expect(months[11]).toMatchObject({ month: 6, year: 2027, isCurrent: false, isPast: false });
    // Nenhum mês do passado deve aparecer.
    expect(
      months.every((m: { year: number; month: number }) => m.year > 2026 || (m.year === 2026 && m.month >= 7))
    ).toBe(true);
  });

  it('o parâmetro offset desloca a janela para frente (nunca para o passado)', async () => {
    mockQueries({});

    const res = await request(app)
      .get('/planning/annual?offset=6')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.offset).toBe(6);
    expect(res.body.months[0]).toMatchObject({ month: 1, year: 2027 });
    expect(res.body.months[11]).toMatchObject({ month: 12, year: 2027 });
  });

  it('deve agregar receitas (CREDIT) e despesas variáveis (DEBIT) do mês atual', async () => {
    mockQueries({
      windowTxs: [
        makeTxDoc({ type: 'CREDIT', amount: 5000, date: toTimestamp(new Date('2026-07-10T12:00:00')) }),
        makeTxDoc({ type: 'DEBIT', amount: -200, date: toTimestamp(new Date('2026-07-20T12:00:00')) }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.months[0]).toMatchObject({ month: 7, year: 2026, receitas: 5000, despesasVariaveis: 200 });
  });

  it('deve projetar parcelas futuras a partir da 1ª parcela real (âncora = data da compra)', async () => {
    // "Compra Notebook 1/3" em Julho (mês atual) — só a parcela 1 tem transação real.
    mockQueries({
      windowTxs: [
        makeTxDoc({
          description: 'Compra Notebook 1/3',
          amount: -300,
          date: toTimestamp(new Date('2026-07-10T12:00:00')),
        }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    const months = res.body.months;

    expect(months[0].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 1, installmentTotal: 3, isProjected: false, amount: 300 }),
    ]);
    expect(months[1].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 2, isProjected: true, amount: 300 }),
    ]);
    expect(months[2].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 3, isProjected: true, amount: 300 }),
    ]);
  });

  it('deve retroceder a âncora quando a 1ª transação real não é a parcela 1 (conector de fatura)', async () => {
    // Só a parcela 3/12 tem transação real, datada em Maio (antes da janela) — a âncora
    // recua para Março, fora da janela; as parcelas passadas simplesmente não aparecem
    // (a janela não volta ao passado) e as futuras seguem projetadas normalmente.
    mockQueries({
      lookbackTxs: [
        makeTxDoc({
          description: 'Compra Celular 3/12',
          amount: -1000,
          date: toTimestamp(new Date('2026-05-15T12:00:00')),
        }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;

    // Julho (mês atual, parcela 5) não tem transação real → não aparece.
    expect(months[0].parceladas).toEqual([]);
    // Parcelas futuras (6 em Agosto, 10 em Dezembro) são projetadas.
    expect(months[1].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 6, isProjected: true }),
    ]);
    expect(months[5].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 10, isProjected: true }),
    ]);
  });

  it('deve detectar parcelamento via creditCardMetadata quando a descrição não tem padrão N/M', async () => {
    mockQueries({
      windowTxs: [
        makeTxDoc({
          description: 'Compra Loja XYZ',
          amount: -400,
          date: toTimestamp(new Date('2026-07-01T12:00:00')),
          creditCardMetadata: { installmentNumber: 1, totalInstallments: 2 },
        }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;
    expect(months[0].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 1, installmentTotal: 2, amount: 400 }),
    ]);
    expect(months[1].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 2, isProjected: true, amount: 400 }),
    ]);
  });

  it('deve distribuir parcelas em meses distintos mesmo com centavos de diferença entre elas (conector data-da-compra)', async () => {
    // Mercado Pago/Samsung: todas as parcelas chegam com a MESMA data (a da compra)
    // e a 1ª carrega o resto do arredondamento (333.34 vs 333.33). O fingerprint
    // antigo usava o valor exato → cada parcela virava um grupo próprio e todas
    // eram lançadas no mês da compra.
    mockQueries({
      windowTxs: [
        makeTxDoc({ description: 'Notebook Dell 1/3', amount: -333.34, date: toTimestamp(new Date('2026-11-10T12:00:00')) }),
        makeTxDoc({ description: 'Notebook Dell 2/3', amount: -333.33, date: toTimestamp(new Date('2026-11-10T12:00:00')) }),
        makeTxDoc({ description: 'Notebook Dell 3/3', amount: -333.33, date: toTimestamp(new Date('2026-11-10T12:00:00')) }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    const months = res.body.months;

    // Uma parcela por mês, com o valor real de cada uma — nunca as 3 em Novembro.
    expect(months[4].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 1, isProjected: false, amount: 333.34 }),
    ]);
    expect(months[5].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 2, isProjected: false, amount: 333.33 }),
    ]);
    expect(months[6].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 3, isProjected: false, amount: 333.33 }),
    ]);
    expect(months[4].totalParceladas).toBeCloseTo(333.34);
  });

  it('deve agrupar parcelas via metadata quando a descrição tem contador em formato livre ("Parcela N de M")', async () => {
    // A regex N/M não captura "Parcela 2 de 4", então a descrição diferia em
    // cada parcela e o agrupamento quebrava → todas caíam no mês da compra.
    const date = toTimestamp(new Date('2026-11-05T12:00:00'));
    mockQueries({
      windowTxs: [1, 2, 3, 4].map((n) =>
        makeTxDoc({
          description: `Loja ABC Parcela ${n} de 4`,
          amount: -250,
          date,
          creditCardMetadata: { installmentNumber: n, totalInstallments: 4 },
        })
      ),
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;

    // Distribuídas de Novembro a Fevereiro, uma por mês, com a descrição limpa.
    for (const [idx, curr] of [[4, 1], [5, 2], [6, 3], [7, 4]] as const) {
      expect(months[idx].parceladas).toEqual([
        expect.objectContaining({
          installmentCurrent: curr,
          installmentTotal: 4,
          isProjected: false,
          amount: 250,
          description: 'Loja ABC',
        }),
      ]);
    }
    expect(months[8].parceladas).toEqual([]);
  });

  it('deve distribuir parcelas com contador colado na descrição (ex.: "SAMSUNG NO ITAUSAO03/21")', async () => {
    // Itaú/Samsung: o contador vem sem espaço ("...SAO03/21"), então cada
    // parcela tinha uma descrição diferente após a limpeza → grupos separados
    // → todas somadas no mesmo mês.
    const date = toTimestamp(new Date('2026-08-05T12:00:00'));
    mockQueries({
      windowTxs: [3, 4, 5].map((n) =>
        makeTxDoc({
          description: `SAMSUNG NO ITAUSAO${String(n).padStart(2, '0')}/21`,
          amount: -150,
          date,
          creditCardMetadata: { installmentNumber: n, totalInstallments: 21 },
        })
      ),
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;

    // Uma parcela por mês (Ago/Set/Out) — nunca as 3 somadas em Agosto.
    for (const [idx, curr] of [[1, 3], [2, 4], [3, 5]] as const) {
      expect(months[idx].parceladas).toEqual([
        expect.objectContaining({
          installmentCurrent: curr,
          installmentTotal: 21,
          isProjected: false,
          amount: 150,
          description: 'SAMSUNG NO ITAUSAO',
        }),
      ]);
      expect(months[idx].totalParceladas).toBe(150);
    }
    // Parcelas 6+ são projetadas nos meses seguintes.
    expect(months[4].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 6, isProjected: true }),
    ]);
  });

  it('deve detectar contador colado via regex mesmo sem creditCardMetadata', async () => {
    mockQueries({
      windowTxs: [
        makeTxDoc({
          description: 'SAMSUNG NO ITAUSAO03/21',
          amount: -150,
          date: toTimestamp(new Date('2026-11-10T12:00:00')),
        }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;
    expect(months[4].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 3, installmentTotal: 21, isProjected: false }),
    ]);
    // Não pode cair também em despesasVariaveis.
    expect(months[4].despesasVariaveis).toBe(0);
  });

  it('deve agrupar pela identidade da compra (totalAmount + purchaseDate) mesmo com descrições sem relação', async () => {
    // Mercado Livre trunca o nome de formas diferentes a cada parcela; o id da
    // compra vindo do emissor decide o agrupamento, não a descrição.
    const date = toTimestamp(new Date('2026-08-05T12:00:00'));
    mockQueries({
      windowTxs: [
        makeTxDoc({
          description: 'MERCADOLIVRE*ELETROSHOP',
          amount: -120,
          date,
          creditCardMetadata: { installmentNumber: 1, totalInstallments: 4, totalAmount: 480, purchaseDate: '2026-08-01' },
        }),
        makeTxDoc({
          description: 'MERCADOLIVRE*ELETRO SHOP LTDA',
          amount: -120,
          date,
          creditCardMetadata: { installmentNumber: 2, totalInstallments: 4, totalAmount: 480, purchaseDate: '2026-08-01' },
        }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;

    // Uma compra só: Ago (1/4), Set (2/4), Out projetada — nada somado.
    expect(months[1].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 1, isProjected: false, amount: 120 }),
    ]);
    expect(months[2].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 2, isProjected: false }),
    ]);
    expect(months[3].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 3, isProjected: true }),
    ]);
    // Fica a variante mais longa (mais informativa) da descrição.
    expect(months[1].parceladas[0].description).toBe('MERCADOLIVRE*ELETRO SHOP LTDA');
  });

  it('deve agrupar descrições truncadas por prefixo quando não há id da compra', async () => {
    // "MERCADOLIVRE*LOJA 2/4" e "MERCADOLIVRE*LOJASDULAR 3/4" — mesma compra,
    // nome truncado diferente, sem creditCardMetadata (só regex).
    const date = toTimestamp(new Date('2026-11-10T12:00:00'));
    mockQueries({
      windowTxs: [
        makeTxDoc({ description: 'MERCADOLIVRE*LOJA 2/4', amount: -250, date }),
        makeTxDoc({ description: 'MERCADOLIVRE*LOJASDULAR 3/4', amount: -250, date }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;

    expect(months[4].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 2, isProjected: false }),
    ]);
    expect(months[5].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 3, isProjected: false }),
    ]);
    expect(months[6].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 4, isProjected: true }),
    ]);
  });

  it('não deve fundir compras diferentes com a mesma descrição quando o totalAmount difere', async () => {
    const date = toTimestamp(new Date('2026-11-10T12:00:00'));
    mockQueries({
      windowTxs: [
        makeTxDoc({
          description: 'MERCADOLIVRE*LOJA',
          amount: -120,
          date,
          creditCardMetadata: { installmentNumber: 1, totalInstallments: 4, totalAmount: 480 },
        }),
        makeTxDoc({
          description: 'MERCADOLIVRE*LOJA',
          amount: -120,
          date,
          creditCardMetadata: { installmentNumber: 2, totalInstallments: 4, totalAmount: 600 },
        }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;

    // Duas compras distintas: parcela 1 da compra A e parcela 2 da compra B,
    // ambas reais em Novembro (datas iguais), sem virarem 1 e 2 da mesma compra.
    expect(months[4].parceladas).toHaveLength(2);
    const currs = months[4].parceladas
      .map((p: { installmentCurrent: number }) => p.installmentCurrent)
      .sort();
    expect(currs).toEqual([1, 2]);
  });

  it('deve priorizar creditCardMetadata sobre um falso padrão N/M na descrição (ex.: data)', async () => {
    // "05/07" na descrição é uma data, não parcela — o metadata diz 2/10.
    mockQueries({
      windowTxs: [
        makeTxDoc({
          description: 'PAG*INTERNET 05/07',
          amount: -90,
          date: toTimestamp(new Date('2026-07-03T12:00:00')),
          creditCardMetadata: { installmentNumber: 2, totalInstallments: 10 },
        }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;
    expect(months[0].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 2, installmentTotal: 10, isProjected: false }),
    ]);
    // Projeções seguem a partir de Agosto (parcela 3).
    expect(months[1].parceladas).toEqual([
      expect.objectContaining({ installmentCurrent: 3, isProjected: true }),
    ]);
  });

  it('deve aplicar despesas fixas e receitas recorrentes conforme a frequência e a data de criação', async () => {
    mockQueries({
      fixedExpenses: [
        makeFixedExpenseDoc({ amount: 100, frequency: 'MONTHLY', createdAt: toTimestamp(new Date('2026-01-01T12:00:00')) }),
        makeFixedExpenseDoc({ amount: 300, frequency: 'QUARTERLY', createdAt: toTimestamp(new Date('2026-01-01T12:00:00')) }),
        // Só deve contar a partir de Outubro/2026 (mês de criação, dentro da janela).
        makeFixedExpenseDoc({ amount: 50, frequency: 'MONTHLY', createdAt: toTimestamp(new Date('2026-10-01T12:00:00')) }),
      ],
      recurringIncome: [
        // YEARLY criada em Set/2026 (dentro da janela) — só conta no mês de criação.
        makeRecurringIncomeDoc({ amount: 2000, frequency: 'YEARLY', createdAt: toTimestamp(new Date('2026-09-01T12:00:00')) }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;

    // Julho (idx0): mensal (100) + trimestral (300, monthsElapsed=6).
    expect(months[0].despesasFixas).toBe(400);
    // Agosto (idx1): só a mensal (trimestral só bate a cada 3 meses).
    expect(months[1].despesasFixas).toBe(100);
    // Setembro (idx2): idem.
    expect(months[2].despesasFixas).toBe(100);
    // Outubro (idx3): mensal (100) + trimestral (300, monthsElapsed=9) + nova despesa (50).
    expect(months[3].despesasFixas).toBe(450);
    // Novembro (idx4): mensal (100) + nova despesa (50).
    expect(months[4].despesasFixas).toBe(150);

    // Receita recorrente YEARLY só conta no mês de criação (Setembro, idx2).
    expect(months[2].receitasRecorrentes).toBe(2000);
    expect(months[0].receitasRecorrentes).toBe(0);
    expect(months[3].receitasRecorrentes).toBe(0);
  });

  it('lança compra no crédito (conta CREDIT) para o mês seguinte — cobrada na fatura da frente', async () => {
    mockQueries({
      windowTxs: [
        makeTxDoc({
          id: 'tx-credito',
          accountId: 'acc-credito',
          description: 'Restaurante',
          amount: -300,
          date: toTimestamp(new Date('2026-07-20T12:00:00')),
          category: 'Alimentação',
        }),
      ],
      accounts: [makeAccountDoc({ id: 'acc-credito', type: 'CREDIT' })],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;
    // Compra em Julho no cartão de crédito → cobrada em Agosto (idx1), não em Julho.
    expect(months[0].despesasVariaveis).toBe(0);
    expect(months[1].despesasVariaveis).toBe(300);

    const row = res.body.expenseRows.find((r: { id: string }) => r.id === 'oneoff-tx-credito');
    expect(row.monthlyCells[0]).toBeNull();
    expect(row.monthlyCells[1]).toMatchObject({ amount: 300, isProjected: false });
  });

  it('mantém compra no débito/PIX (conta BANK) no próprio mês', async () => {
    mockQueries({
      windowTxs: [
        makeTxDoc({
          id: 'tx-debito',
          accountId: 'acc-banco',
          amount: -150,
          date: toTimestamp(new Date('2026-07-20T12:00:00')),
        }),
      ],
      accounts: [makeAccountDoc({ id: 'acc-banco', type: 'BANK' })],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;
    expect(months[0].despesasVariaveis).toBe(150);
    expect(months[1].despesasVariaveis).toBe(0);
  });

  it('traz compra no crédito do mês anterior (lookback) para a fatura do mês atual', async () => {
    mockQueries({
      lookbackTxs: [
        makeTxDoc({
          id: 'tx-credito-junho',
          accountId: 'acc-credito',
          amount: -400,
          date: toTimestamp(new Date('2026-06-25T12:00:00')),
        }),
      ],
      accounts: [makeAccountDoc({ id: 'acc-credito', type: 'CREDIT' })],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;
    // Compra em Junho no crédito → cobrada em Julho (mês atual, idx0).
    expect(months[0].despesasVariaveis).toBe(400);
  });

  it('inclui a despesa de crédito deslocada no saldo do mês seguinte', async () => {
    mockQueries({
      windowTxs: [
        makeTxDoc({
          id: 'tx-credito-saldo',
          accountId: 'acc-credito',
          amount: -500,
          date: toTimestamp(new Date('2026-07-20T12:00:00')),
        }),
      ],
      accounts: [makeAccountDoc({ id: 'acc-credito', type: 'CREDIT' })],
      recurringIncome: [
        makeRecurringIncomeDoc({ amount: 3000, frequency: 'MONTHLY', createdAt: toTimestamp(new Date('2026-01-01T12:00:00')) }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;
    // Agosto (idx1, futuro): 3000 (receita recorrente) - 500 (crédito de Julho) = 2500.
    expect(months[1].saldo).toBe(2500);
  });

  it('suprime a projeção da despesa fixa no mês da fatura quando ela é paga no crédito (não duplica no saldo)', async () => {
    mockQueries({
      windowTxs: [
        makeTxDoc({
          id: 'tx-netflix',
          accountId: 'acc-credito',
          description: 'NETFLIX.COM',
          amount: -44.9,
          date: toTimestamp(new Date('2026-07-18T12:00:00')),
        }),
      ],
      accounts: [makeAccountDoc({ id: 'acc-credito', type: 'CREDIT' })],
      fixedExpenses: [
        makeFixedExpenseDoc({
          id: 'exp-netflix',
          name: 'Netflix',
          amount: 44.9,
          category: 'Assinaturas',
          createdAt: toTimestamp(new Date('2026-01-01T12:00:00')),
        }),
      ],
      recurringIncome: [
        makeRecurringIncomeDoc({ amount: 3000, frequency: 'MONTHLY', createdAt: toTimestamp(new Date('2026-01-01T12:00:00')) }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;

    // Agosto (idx1, mês da fatura): a compra real no crédito entra como variável…
    expect(months[1].despesasVariaveis).toBeCloseTo(44.9);
    // …e a projeção da fixa Netflix é suprimida nesse mês (não soma de novo).
    expect(months[1].despesasFixas).toBe(0);
    // saldo de Agosto = 3000 - 44.90 (contado uma única vez).
    expect(months[1].saldo).toBeCloseTo(2955.1);

    // Setembro (idx2): sem compra real → a fixa volta a ser projetada normalmente.
    expect(months[2].despesasFixas).toBeCloseTo(44.9);
    expect(months[2].saldo).toBeCloseTo(2955.1);

    // A linha FIXED da Netflix não tem célula em Agosto, mas tem em Setembro.
    const row = res.body.expenseRows.find((r: { id: string }) => r.id === 'fixed-exp-netflix');
    expect(row.monthlyCells[1]).toBeNull();
    expect(row.monthlyCells[2]).toMatchObject({ amount: 44.9 });
  });

  it('não suprime a fixa quando só o valor coincide, mas a descrição não bate (evita falso positivo)', async () => {
    mockQueries({
      windowTxs: [
        makeTxDoc({
          id: 'tx-outro',
          accountId: 'acc-credito',
          description: 'PADARIA DO ZE',
          amount: -44.9,
          date: toTimestamp(new Date('2026-07-18T12:00:00')),
        }),
      ],
      accounts: [makeAccountDoc({ id: 'acc-credito', type: 'CREDIT' })],
      fixedExpenses: [
        makeFixedExpenseDoc({
          id: 'exp-netflix',
          name: 'Netflix',
          amount: 44.9,
          createdAt: toTimestamp(new Date('2026-01-01T12:00:00')),
        }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;
    // Compra sem relação com a Netflix: a fixa continua projetada em Agosto,
    // além da variável real — pois só o valor coincide, não o nome.
    expect(months[1].despesasVariaveis).toBeCloseTo(44.9);
    expect(months[1].despesasFixas).toBeCloseTo(44.9);
  });

  it('não deduz despesas fixas no saldo do mês atual (evita duplicar com as variáveis reais), mas deduz nos meses futuros', async () => {
    mockQueries({
      windowTxs: [
        makeTxDoc({ type: 'CREDIT', amount: 4000, date: toTimestamp(new Date('2026-07-01T12:00:00')) }),
        makeTxDoc({ type: 'DEBIT', amount: -800, date: toTimestamp(new Date('2026-07-05T12:00:00')) }),
      ],
      fixedExpenses: [
        makeFixedExpenseDoc({ amount: 200, frequency: 'MONTHLY', createdAt: toTimestamp(new Date('2026-01-01T12:00:00')) }),
      ],
      recurringIncome: [
        makeRecurringIncomeDoc({ amount: 3000, frequency: 'MONTHLY', createdAt: toTimestamp(new Date('2026-01-01T12:00:00')) }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;

    // A coluna de despesas fixas continua exibindo o valor no mês atual…
    expect(months[0].despesasFixas).toBe(200);
    // …mas o saldo NÃO a deduz (já está nas variáveis reais): 4000 - 800 = 3200.
    expect(months[0].saldo).toBe(3200);

    // Agosto (futuro): sem dado real, a fixa é projetada e deduzida normalmente:
    // 3000 (receita recorrente) - 200 (fixa) = 2800.
    expect(months[1].saldo).toBe(2800);
  });

  it('deve calcular o saldo usando dados reais no mês atual e projeções nos meses futuros', async () => {
    mockQueries({
      windowTxs: [
        makeTxDoc({ type: 'CREDIT', amount: 5000, date: toTimestamp(new Date('2026-07-01T12:00:00')) }),
        makeTxDoc({ type: 'DEBIT', amount: -1000, date: toTimestamp(new Date('2026-07-05T12:00:00')) }),
      ],
      fixedExpenses: [
        makeFixedExpenseDoc({ amount: 200, frequency: 'MONTHLY', createdAt: toTimestamp(new Date('2026-01-01T12:00:00')) }),
      ],
      recurringIncome: [
        makeRecurringIncomeDoc({ amount: 3000, frequency: 'MONTHLY', createdAt: toTimestamp(new Date('2026-01-01T12:00:00')) }),
      ],
    });

    const res = await request(app)
      .get('/planning/annual')
      .set('Authorization', 'Bearer valid-token');

    const months = res.body.months;

    // Julho (mês atual): as despesas fixas NÃO entram no saldo — já estão
    // refletidas nas variáveis reais da Pluggy. saldo = receitas reais -
    // (despesasVariaveis + parceladas) = 5000 - (1000 + 0) = 4000
    expect(months[0].saldo).toBe(4000);

    // Dezembro (futuro): saldo = receitasRecorrentes - (despesasFixas + parceladas)
    // = 3000 - 200 = 2800 (sem despesasVariaveis, que só existem no mês atual)
    expect(months[5].saldo).toBe(2800);
  });

  describe('expenseRows', () => {
    it('deve gerar uma linha FIXED por gasto fixo, com o mesmo valor repetido e totalAmount = valor por ocorrência', async () => {
      mockQueries({
        fixedExpenses: [
          makeFixedExpenseDoc({
            id: 'exp-hbo',
            name: 'HBO',
            amount: 22.45,
            frequency: 'MONTHLY',
            category: 'Assinaturas',
            createdAt: toTimestamp(new Date('2026-01-01T12:00:00')),
          }),
        ],
      });

      const res = await request(app)
        .get('/planning/annual')
        .set('Authorization', 'Bearer valid-token');

      const row = res.body.expenseRows.find((r: { id: string }) => r.id === 'fixed-exp-hbo');
      expect(row).toMatchObject({
        description: 'HBO',
        category: 'Assinaturas',
        paymentMethod: null,
        kind: 'FIXED',
        totalAmount: 22.45,
      });
      expect(row.monthlyCells[0]).toMatchObject({ amount: 22.45, isProjected: false });
      expect(row.monthlyCells[11]).toMatchObject({ amount: 22.45, isProjected: false });
    });

    it('deve gerar uma linha INSTALLMENT com monthlyCells nos meses corretos e totalAmount = soma das parcelas', async () => {
      // Mesmo cenário de projeção já coberto acima (Notebook 1/3, âncora no mês atual).
      mockQueries({
        windowTxs: [
          makeTxDoc({
            description: 'Compra Notebook 1/3',
            amount: -300,
            date: toTimestamp(new Date('2026-07-10T12:00:00')),
          }),
        ],
      });

      const res = await request(app)
        .get('/planning/annual')
        .set('Authorization', 'Bearer valid-token');

      const row = res.body.expenseRows.find((r: { kind: string }) => r.kind === 'INSTALLMENT');
      expect(row).toMatchObject({
        description: 'Compra Notebook',
        installmentTotal: 3,
        totalAmount: 900,
      });
      expect(row.monthlyCells[0]).toMatchObject({ amount: 300, isProjected: false });
      expect(row.monthlyCells[1]).toMatchObject({ amount: 300, isProjected: true });
      expect(row.monthlyCells[2]).toMatchObject({ amount: 300, isProjected: true });
      expect(row.monthlyCells[3]).toBeNull();
    });

    it('deve gerar uma linha ONE_OFF por transação avulsa no mês atual, com valor só nesse mês', async () => {
      mockQueries({
        windowTxs: [
          makeTxDoc({
            id: 'tx-avulsa',
            description: 'Colheres madeira',
            amount: -20,
            date: toTimestamp(new Date('2026-07-05T12:00:00')),
            category: 'Compras',
          }),
        ],
      });

      const res = await request(app)
        .get('/planning/annual')
        .set('Authorization', 'Bearer valid-token');

      const row = res.body.expenseRows.find((r: { id: string }) => r.id === 'oneoff-tx-avulsa');
      expect(row).toMatchObject({
        description: 'Colheres madeira',
        category: 'Compras',
        kind: 'ONE_OFF',
        totalAmount: 20,
      });
      expect(row.monthlyCells[0]).toMatchObject({ amount: 20, isProjected: false });
      expect(row.monthlyCells.filter((c: unknown) => c !== null)).toHaveLength(1);
    });

    it('deve usar userCategory no lugar de category quando presente na transação avulsa', async () => {
      mockQueries({
        windowTxs: [
          makeTxDoc({
            id: 'tx-recat',
            amount: -50,
            date: toTimestamp(new Date('2026-07-05T12:00:00')),
            category: 'Outros',
            userCategory: 'Lazer',
          }),
        ],
      });

      const res = await request(app)
        .get('/planning/annual')
        .set('Authorization', 'Bearer valid-token');

      const row = res.body.expenseRows.find((r: { id: string }) => r.id === 'oneoff-tx-recat');
      expect(row.category).toBe('Lazer');
    });

    it('deve resolver método de pagamento "Pix" a partir de paymentData.paymentMethod', async () => {
      mockQueries({
        windowTxs: [
          makeTxDoc({
            id: 'tx-pix',
            amount: -75,
            date: toTimestamp(new Date('2026-07-05T12:00:00')),
            paymentData: { paymentMethod: 'PIX' },
          }),
        ],
      });

      const res = await request(app)
        .get('/planning/annual')
        .set('Authorization', 'Bearer valid-token');

      const row = res.body.expenseRows.find((r: { id: string }) => r.id === 'oneoff-tx-pix');
      expect(row.paymentMethod).toBe('Pix');
    });

    it('deve resolver método de pagamento pelo nome do conector (account → pluggyItem) quando não há paymentData', async () => {
      mockQueries({
        windowTxs: [
          makeTxDoc({
            id: 'tx-cartao',
            accountId: 'acc-001',
            amount: -60,
            date: toTimestamp(new Date('2026-07-06T12:00:00')),
          }),
        ],
        accounts: [makeAccountDoc({ id: 'acc-001', pluggyItemId: 'item-001' })],
        pluggyItems: [makePluggyItemDoc({ pluggyItemId: 'item-001', connectorName: 'Nubank' })],
      });

      const res = await request(app)
        .get('/planning/annual')
        .set('Authorization', 'Bearer valid-token');

      const row = res.body.expenseRows.find((r: { id: string }) => r.id === 'oneoff-tx-cartao');
      expect(row.paymentMethod).toBe('Nubank');
    });

    it('deve retornar método de pagamento null quando não há paymentData nem account/pluggyItem resolvíveis', async () => {
      mockQueries({
        windowTxs: [
          makeTxDoc({
            id: 'tx-sem-metodo',
            accountId: 'acc-desconhecida',
            amount: -30,
            date: toTimestamp(new Date('2026-07-07T12:00:00')),
          }),
        ],
      });

      const res = await request(app)
        .get('/planning/annual')
        .set('Authorization', 'Bearer valid-token');

      const row = res.body.expenseRows.find((r: { id: string }) => r.id === 'oneoff-tx-sem-metodo');
      expect(row.paymentMethod).toBeNull();
    });
  });
});
