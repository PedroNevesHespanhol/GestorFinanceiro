import { Router, Request, Response, NextFunction } from 'express';
import { Timestamp, UpdateData } from 'firebase-admin/firestore';
import { body } from 'express-validator';
import {
  collections,
  FixedExpenseDoc,
  RecurringIncomeDoc,
} from '../services/firestore';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

const FREQUENCIES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];

// ─── Fixed Expenses ───────────────────────────────────────────────────────────

const fixedExpenseValidators = [
  body('name').notEmpty().isString().withMessage('name is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('amount must be a positive number'),
  body('frequency')
    .isIn(FREQUENCIES)
    .withMessage(`frequency must be one of: ${FREQUENCIES.join(', ')}`),
  body('category').notEmpty().isString().withMessage('category is required'),
  body('dueDate').optional().isInt({ min: 1, max: 31 }),
  body('active').optional().isBoolean(),
];

/**
 * POST /fixed-expenses
 */
router.post(
  '/fixed-expenses',
  authMiddleware,
  fixedExpenseValidators,
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { name, amount, frequency, category, dueDate, active } =
        req.body as Omit<FixedExpenseDoc, 'id' | 'createdAt'>;

      const ref = collections.fixedExpenses(userId).doc();
      const doc: FixedExpenseDoc = {
        id: ref.id,
        name,
        amount,
        frequency,
        category,
        ...(dueDate !== undefined ? { dueDate } : {}),
        active: active ?? true,
        createdAt: Timestamp.now(),
      };
      await ref.set(doc);

      res.status(201).json({ fixedExpense: doc });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /fixed-expenses
 */
router.get(
  '/fixed-expenses',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const snap = await collections
        .fixedExpenses(userId)
        .orderBy('createdAt', 'desc')
        .get();
      const fixedExpenses = snap.docs.map((d) => d.data() as FixedExpenseDoc);
      res.json({ fixedExpenses });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /fixed-expenses/:id
 */
router.put(
  '/fixed-expenses/:id',
  authMiddleware,
  [
    body('name').optional().isString(),
    body('amount').optional().isFloat({ gt: 0 }),
    body('frequency').optional().isIn(FREQUENCIES),
    body('category').optional().isString(),
    body('dueDate').optional().isInt({ min: 1, max: 31 }),
    body('active').optional().isBoolean(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const ref = collections.fixedExpense(userId, id);
      const snap = await ref.get();

      if (!snap.exists) {
        res.status(404).json({ error: 'Fixed expense not found' });
        return;
      }

      const body = req.body as Partial<Omit<FixedExpenseDoc, 'id' | 'createdAt'>>;
      const updates: Partial<FixedExpenseDoc> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.amount !== undefined) updates.amount = body.amount;
      if (body.frequency !== undefined) updates.frequency = body.frequency;
      if (body.category !== undefined) updates.category = body.category;
      if (body.dueDate !== undefined) updates.dueDate = body.dueDate;
      if (body.active !== undefined) updates.active = body.active;
      await ref.update(updates as UpdateData<FixedExpenseDoc>);

      const updated = (await ref.get()).data() as FixedExpenseDoc;
      res.json({ fixedExpense: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /fixed-expenses/:id
 */
router.delete(
  '/fixed-expenses/:id',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const ref = collections.fixedExpense(userId, id);
      const snap = await ref.get();

      if (!snap.exists) {
        res.status(404).json({ error: 'Fixed expense not found' });
        return;
      }

      await ref.delete();
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// ─── Recurring Income ─────────────────────────────────────────────────────────

const recurringIncomeValidators = [
  body('name').notEmpty().isString().withMessage('name is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('amount must be a positive number'),
  body('frequency')
    .isIn(FREQUENCIES)
    .withMessage(`frequency must be one of: ${FREQUENCIES.join(', ')}`),
  body('category').notEmpty().isString().withMessage('category is required'),
  body('expectedDate').optional().isInt({ min: 1, max: 31 }),
  body('active').optional().isBoolean(),
];

/**
 * POST /recurring-income
 */
router.post(
  '/recurring-income',
  authMiddleware,
  recurringIncomeValidators,
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { name, amount, frequency, category, expectedDate, active } =
        req.body as Omit<RecurringIncomeDoc, 'id' | 'createdAt'>;

      const ref = collections.recurringIncome(userId).doc();
      const doc: RecurringIncomeDoc = {
        id: ref.id,
        name,
        amount,
        frequency,
        category,
        ...(expectedDate !== undefined ? { expectedDate } : {}),
        active: active ?? true,
        createdAt: Timestamp.now(),
      };
      await ref.set(doc);

      res.status(201).json({ recurringIncome: doc });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /recurring-income
 */
router.get(
  '/recurring-income',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const snap = await collections
        .recurringIncome(userId)
        .orderBy('createdAt', 'desc')
        .get();
      const recurringIncome = snap.docs.map(
        (d) => d.data() as RecurringIncomeDoc
      );
      res.json({ recurringIncome });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /recurring-income/:id
 */
router.put(
  '/recurring-income/:id',
  authMiddleware,
  [
    body('name').optional().isString(),
    body('amount').optional().isFloat({ gt: 0 }),
    body('frequency').optional().isIn(FREQUENCIES),
    body('category').optional().isString(),
    body('expectedDate').optional().isInt({ min: 1, max: 31 }),
    body('active').optional().isBoolean(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const ref = collections.recurringIncomeDoc(userId, id);
      const snap = await ref.get();

      if (!snap.exists) {
        res.status(404).json({ error: 'Recurring income not found' });
        return;
      }

      const body = req.body as Partial<
        Omit<RecurringIncomeDoc, 'id' | 'createdAt'>
      >;
      const updates: Partial<RecurringIncomeDoc> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.amount !== undefined) updates.amount = body.amount;
      if (body.frequency !== undefined) updates.frequency = body.frequency;
      if (body.category !== undefined) updates.category = body.category;
      if (body.expectedDate !== undefined) updates.expectedDate = body.expectedDate;
      if (body.active !== undefined) updates.active = body.active;
      await ref.update(updates as UpdateData<RecurringIncomeDoc>);

      const updated = (await ref.get()).data() as RecurringIncomeDoc;
      res.json({ recurringIncome: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /recurring-income/:id
 */
router.delete(
  '/recurring-income/:id',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const ref = collections.recurringIncomeDoc(userId, id);
      const snap = await ref.get();

      if (!snap.exists) {
        res.status(404).json({ error: 'Recurring income not found' });
        return;
      }

      await ref.delete();
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
