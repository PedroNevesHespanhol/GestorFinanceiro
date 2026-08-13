import { Router, Request, Response, NextFunction } from 'express';
import { Timestamp, Query, UpdateData } from 'firebase-admin/firestore';
import { body, query } from 'express-validator';
import { collections, TransactionDoc } from '../services/firestore';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

/**
 * GET /transactions
 * Lists transactions with optional filters:
 *  - accountId (string)
 *  - category  (string)
 *  - dateFrom  (ISO string YYYY-MM-DD)
 *  - dateTo    (ISO string YYYY-MM-DD)
 *  - tags      (comma-separated string)
 */
router.get(
  '/',
  authMiddleware,
  [
    query('dateFrom').optional().isISO8601().withMessage('dateFrom must be ISO8601'),
    query('dateTo').optional().isISO8601().withMessage('dateTo must be ISO8601'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const {
        accountId,
        category,
        dateFrom,
        dateTo,
        tags,
      } = req.query as Record<string, string | undefined>;

      // Use orderBy only when no equality filters are applied to other fields,
      // because Firestore requires composite indexes for where(fieldA) + orderBy(fieldB).
      // When filtering by accountId or category, we skip orderBy and sort in memory.
      const hasEqualityFilter = !!(accountId || category);

      let ref = collections.transactions(userId) as Query;

      if (!hasEqualityFilter) {
        ref = ref.orderBy('date', 'desc');
      }

      if (accountId) {
        ref = ref.where('accountId', '==', accountId);
      }

      if (category) {
        ref = ref.where('category', '==', category);
      }

      if (dateFrom) {
        if (!hasEqualityFilter) {
          ref = ref.where('date', '>=', Timestamp.fromDate(new Date(dateFrom)));
        }
      }

      if (dateTo) {
        if (!hasEqualityFilter) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          ref = ref.where('date', '<=', Timestamp.fromDate(toDate));
        }
      }

      const MAX_PAGE_SIZE = parseInt(process.env.TRANSACTIONS_MAX_PAGE_SIZE ?? '500', 10);
      const snap = await ref.limit(MAX_PAGE_SIZE).get();
      let transactions = snap.docs.map((d) => {
        const data = d.data() as TransactionDoc;
        return {
          ...data,
          // Serialize Firestore Timestamp to ISO string for the frontend
          date: data.date instanceof Timestamp
            ? data.date.toDate().toISOString()
            : data.date,
          syncedAt: data.syncedAt instanceof Timestamp
            ? data.syncedAt.toDate().toISOString()
            : data.syncedAt,
        };
      });

      // When equality filters were applied, date filtering and sorting happen in memory
      if (hasEqualityFilter) {
        const from = dateFrom ? new Date(dateFrom).getTime() : null;
        const to = dateTo ? (() => { const d = new Date(dateTo); d.setHours(23,59,59,999); return d.getTime(); })() : null;

        if (from !== null || to !== null) {
          transactions = transactions.filter((tx) => {
            const t = new Date(tx.date as string).getTime();
            if (from !== null && t < from) return false;
            if (to !== null && t > to) return false;
            return true;
          });
        }

        transactions.sort((a, b) =>
          new Date(b.date as string).getTime() - new Date(a.date as string).getTime()
        );
      }

      // Filter by tags (array-contains-any not trivial with multiple tags; filter in memory)
      if (tags) {
        const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
        if (tagList.length > 0) {
          transactions = transactions.filter(
            (tx) => tx.tags && tagList.some((tag) => tx.tags!.includes(tag))
          );
        }
      }

      res.json({ transactions });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /transactions/:id
 * Updates user annotations on a transaction: userCategory, tags, notes.
 */
router.post(
  '/:id',
  authMiddleware,
  [
    body('userCategory').optional().isString(),
    body('tags').optional().isArray(),
    body('tags.*').optional().isString(),
    body('notes').optional().isString(),
    body('linkedSplitReimbursement').optional().isString(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const { userCategory, tags, notes, linkedSplitReimbursement } =
        req.body as {
          userCategory?: string;
          tags?: string[];
          notes?: string;
          linkedSplitReimbursement?: string;
        };

      const ref = collections.transaction(userId, id);
      const snap = await ref.get();

      if (!snap.exists) {
        res.status(404).json({ error: 'Transaction not found' });
        return;
      }

      const updates: Partial<TransactionDoc> = {};
      if (userCategory !== undefined) updates.userCategory = userCategory;
      if (tags !== undefined) updates.tags = tags;
      if (notes !== undefined) updates.notes = notes;
      if (linkedSplitReimbursement !== undefined)
        updates.linkedSplitReimbursement = linkedSplitReimbursement;

      await ref.update(updates as UpdateData<TransactionDoc>);

      const updated = (await ref.get()).data() as TransactionDoc;
      res.json({ transaction: updated });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
