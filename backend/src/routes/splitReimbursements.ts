import { Router, Request, Response, NextFunction } from 'express';
import { Timestamp, UpdateData } from 'firebase-admin/firestore';
import { body } from 'express-validator';
import {
  collections,
  SplitReimbursementDoc,
  SplitParticipant,
} from '../services/firestore';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

const participantValidators = [
  body('participants').isArray({ min: 1 }).withMessage('participants must be a non-empty array'),
  body('participants.*.id').notEmpty().isString(),
  body('participants.*.name').notEmpty().isString(),
  body('participants.*.email').optional().isEmail(),
  body('participants.*.amount').isFloat({ gt: 0 }),
  body('participants.*.settled').isBoolean(),
];

/**
 * POST /split-reimbursements
 */
router.post(
  '/',
  authMiddleware,
  [
    body('description').notEmpty().isString(),
    body('totalAmount').isFloat({ gt: 0 }),
    body('date').isISO8601().withMessage('date must be ISO8601'),
    body('paidBy').notEmpty().isString(),
    ...participantValidators,
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const {
        description,
        totalAmount,
        date,
        participants,
        paidBy,
      } = req.body as {
        description: string;
        totalAmount: number;
        date: string;
        participants: SplitParticipant[];
        paidBy: string;
      };

      const allSettled = participants.every((p) => p.settled);
      const anySettled = participants.some((p) => p.settled);
      const status: SplitReimbursementDoc['status'] = allSettled
        ? 'SETTLED'
        : anySettled
        ? 'PARTIALLY_SETTLED'
        : 'PENDING';

      const ref = collections.splitReimbursements(userId).doc();
      const sanitizedParticipants = participants.map((p) => ({
        id: p.id,
        name: p.name,
        amount: p.amount,
        settled: p.settled,
        ...(p.email ? { email: p.email } : {}),
        ...(p.settledAt ? { settledAt: p.settledAt } : {}),
      }));

      const doc: SplitReimbursementDoc = {
        id: ref.id,
        description,
        totalAmount,
        currency: 'BRL',
        date: Timestamp.fromDate(new Date(date)),
        participants: sanitizedParticipants,
        status,
        paidBy,
        createdAt: Timestamp.now(),
      };

      await ref.set(doc);
      res.status(201).json({ splitReimbursement: doc });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /split-reimbursements
 */
router.get(
  '/',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const snap = await collections
        .splitReimbursements(userId)
        .orderBy('date', 'asc')
        .get();
      const splitReimbursements = snap.docs.map(
        (d) => d.data() as SplitReimbursementDoc
      );
      res.json({ splitReimbursements });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /split-reimbursements/:id
 */
router.put(
  '/:id',
  authMiddleware,
  [
    body('description').optional().isString(),
    body('totalAmount').optional().isFloat({ gt: 0 }),
    body('date').optional().isISO8601(),
    body('paidBy').optional().isString(),
    body('participants').optional().isArray({ min: 1 }),
    // Wildcard validators only run when the array is present, so these are
    // effectively "required per participant" without making the array itself required.
    body('participants.*.id').notEmpty().isString(),
    body('participants.*.name').notEmpty().isString(),
    body('participants.*.email').optional().isEmail(),
    body('participants.*.amount').isFloat({ gt: 0 }),
    body('participants.*.settled').isBoolean(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const ref = collections.splitReimbursement(userId, id);
      const snap = await ref.get();

      if (!snap.exists) {
        res.status(404).json({ error: 'Split reimbursement not found' });
        return;
      }

      const body = req.body as Partial<{
        description: string;
        totalAmount: number;
        date: string;
        participants: SplitParticipant[];
        paidBy: string;
      }>;

      const updates: Partial<SplitReimbursementDoc> = {};
      if (body.description !== undefined) updates.description = body.description;
      if (body.totalAmount !== undefined) updates.totalAmount = body.totalAmount;
      if (body.date !== undefined)
        updates.date = Timestamp.fromDate(new Date(body.date));
      if (body.paidBy !== undefined) updates.paidBy = body.paidBy;
      if (body.participants !== undefined) {
        updates.participants = body.participants;
        const allSettled = body.participants.every((p) => p.settled);
        const anySettled = body.participants.some((p) => p.settled);
        updates.status = allSettled
          ? 'SETTLED'
          : anySettled
          ? 'PARTIALLY_SETTLED'
          : 'PENDING';
      }

      await ref.update(updates as UpdateData<SplitReimbursementDoc>);

      const updated = (await ref.get()).data() as SplitReimbursementDoc;
      res.json({ splitReimbursement: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /split-reimbursements/:id
 */
router.delete(
  '/:id',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const ref = collections.splitReimbursement(userId, id);
      const snap = await ref.get();

      if (!snap.exists) {
        res.status(404).json({ error: 'Split reimbursement not found' });
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
