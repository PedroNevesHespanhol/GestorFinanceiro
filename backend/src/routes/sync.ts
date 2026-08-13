import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { Timestamp } from 'firebase-admin/firestore';
import { createConnectToken, pluggyClient } from '../services/pluggy';
import { syncAllUserItems, syncPluggyItem } from '../services/sync';
import { collections, PluggyItemDoc } from '../services/firestore';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

/**
 * POST /pluggy/connect-token
 * Generates a Pluggy connect token (valid 30 min) for the authenticated user.
 */
router.post(
  '/pluggy/connect-token',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;

      const base = process.env.WEBHOOK_BASE_URL ?? '';
      const webhookUrl = base.startsWith('https://') ? `${base}/webhook` : undefined;

      const accessToken = await createConnectToken({
        clientUserId: userId,
        webhookUrl,
      });

      res.json({ accessToken });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /sync/logs
 * Returns the last 50 sync log entries for the authenticated user.
 */
router.get(
  '/sync/logs',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const snap = await collections.syncLogs(userId)
        .orderBy('syncedAt', 'desc')
        .limit(50)
        .get();
      const logs = snap.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          syncedAt: data.syncedAt?.toDate?.()?.toISOString() ?? data.syncedAt,
        };
      });
      res.json({ logs });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /sync
 * Manually triggers a full sync of all Pluggy items for the authenticated user.
 */
router.post(
  '/sync',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const results = await syncAllUserItems(userId);

      const totalAccounts = results.reduce((s, r) => s + r.accountsSynced, 0);
      const totalTransactions = results.reduce(
        (s, r) => s + r.transactionsSynced,
        0
      );
      const allErrors = results.flatMap((r) => r.errors);

      res.json({
        itemsSynced: results.length,
        accountsSynced: totalAccounts,
        transactionsSynced: totalTransactions,
        errors: allErrors,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /pluggy/items
 * Called by the frontend after Pluggy Connect widget succeeds.
 * Saves the new item to Firestore and triggers an immediate sync.
 * Needed in dev (no webhook) and as a fallback in production.
 */
router.post(
  '/pluggy/items',
  authMiddleware,
  [body('itemId').isString().notEmpty()],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { itemId } = req.body as { itemId: string };

      // Fetch item details from Pluggy
      const item = await pluggyClient.fetchItem(itemId);

      // Save to Firestore
      const webhookUrl = `${process.env.WEBHOOK_BASE_URL ?? 'http://localhost:3001'}/webhook`;
      const ref = collections.pluggyItems(userId).doc(itemId);
      const doc: PluggyItemDoc = {
        id: itemId,
        pluggyItemId: itemId,
        connectorId: item.connector.id,
        connectorName: item.connector.name,
        status: 'UPDATED',
        lastUpdatedAt: Timestamp.now(),
        lastSyncAttempt: Timestamp.now(),
        webhookUrl,
        createdAt: Timestamp.now(),
      };
      await ref.set(doc, { merge: true });

      // Trigger sync in background
      syncPluggyItem(userId, itemId).catch((err) =>
        console.error('[pluggy/items] background sync error:', err)
      );

      res.json({ itemId, status: 'syncing' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
