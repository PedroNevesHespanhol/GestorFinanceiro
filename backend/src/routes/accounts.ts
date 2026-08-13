import { Router, Request, Response, NextFunction } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { collections, AccountDoc, PluggyItemDoc } from '../services/firestore';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

/**
 * GET /accounts
 * Lists all accounts for the authenticated user from Firestore,
 * enriched with the status and institution of their parent Pluggy item.
 * Credit card data is flattened (creditLimit, creditAvailableLimit,
 * creditBillDueDate) to match the frontend Account contract.
 */
router.get(
  '/',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;

      const [accountsSnap, itemsSnap] = await Promise.all([
        collections.accounts(userId).orderBy('name').get(),
        collections.pluggyItems(userId).get(),
      ]);

      const itemMap = new Map<string, PluggyItemDoc>();
      for (const doc of itemsSnap.docs) {
        const item = doc.data() as PluggyItemDoc;
        itemMap.set(item.pluggyItemId, item);
      }

      const accounts = accountsSnap.docs.map((d) => {
        const account = d.data() as AccountDoc;
        const item = itemMap.get(account.pluggyItemId);
        return {
          ...account,
          status: item?.status ?? 'UPDATED',
          institution: item?.connectorName,
          lastSyncedAt:
            account.updatedAt instanceof Timestamp
              ? account.updatedAt.toDate().toISOString()
              : undefined,
          creditLimit: account.creditData?.creditLimit,
          creditAvailableLimit: account.creditData?.availableCreditLimit,
          creditBillDueDate: account.creditData?.balanceDueDate || undefined,
        };
      });

      res.json({ accounts });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
