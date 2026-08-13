import { Router, Request, Response, NextFunction } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';
import {
  findUserIdByPluggyItemId,
  syncPluggyItem,
} from '../services/sync';
import { collections, SyncLogDoc } from '../services/firestore';

const router = Router();

interface PluggyWebhookPayload {
  event: string;
  eventId?: string;
  itemId: string;
  error?: {
    code?: string;
    message?: string;
  };
}

/**
 * Verifica assinatura HMAC-SHA256 enviada pela Pluggy no header x-pluggy-signature.
 * Sem PLUGGY_WEBHOOK_SECRET configurado: aceita em dev (com aviso), mas em
 * produção falha fechado — caso contrário qualquer payload forjado seria aceito.
 */
function verifyPluggySignature(req: Request): boolean {
  const secret = process.env.PLUGGY_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Webhook] PLUGGY_WEBHOOK_SECRET not set in production — rejecting webhook');
      return false;
    }
    console.warn('[Webhook] PLUGGY_WEBHOOK_SECRET not set — skipping signature verification (dev only)');
    return true;
  }

  const signature = req.headers['x-pluggy-signature'] as string | undefined;
  if (!signature) {
    return false;
  }

  // Usa o raw body exato (bytes originais capturados pelo `verify` do express.json
  // em index.ts), em vez de reserializar req.body — reserializar pode não bater
  // byte-a-byte com o que a Pluggy assinou e rejeitar webhooks legítimos.
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Comparação em tempo constante para evitar timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}

/**
 * POST /webhook
 * Public route — NO auth middleware.
 * Handles Pluggy webhook events:
 *  - item/updated → full sync
 *  - item/created → full sync
 *  - item/error   → write error to syncLogs
 */
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validação de assinatura HMAC (protege contra payloads forjados)
      if (!verifyPluggySignature(req)) {
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }

      const payload = req.body as PluggyWebhookPayload;
      const { event, eventId, itemId, error } = payload;

      if (!event || !itemId) {
        res.status(400).json({ error: 'Missing event or itemId' });
        return;
      }

      console.log(`[Webhook] Received event: ${event}${eventId ? ` (eventId: ${eventId})` : ''}`);

      // Acknowledge quickly — Pluggy exige 2XX em até 5 segundos
      res.status(200).json({ received: true });

      // Process asynchronously after response
      setImmediate(async () => {
        try {
          const userId = await findUserIdByPluggyItemId(itemId);

          if (!userId) {
            console.warn(`[Webhook] No user found for pluggyItemId: ${itemId}`);
            return;
          }

          if (event === 'item/updated' || event === 'item/created') {
            console.log(
              `[Webhook] ${event} for itemId ${itemId} — starting sync for user ${userId}`
            );
            await syncPluggyItem(userId, itemId);
            console.log(`[Webhook] Sync completed for itemId ${itemId}`);
          } else if (event === 'item/error') {
            const errorMessage =
              error?.message ?? error?.code ?? 'Unknown error from Pluggy';

            const ref = collections.syncLogs(userId).doc();
            const log: SyncLogDoc = {
              id: ref.id,
              pluggyItemId: itemId,
              status: 'ERROR',
              transactionsSynced: 0,
              accountsSynced: 0,
              errorMessage,
              syncedAt: Timestamp.now(),
              duration: 0,
            };
            await ref.set(log);

            // Update item status
            const itemsSnap = await collections
              .pluggyItems(userId)
              .where('pluggyItemId', '==', itemId)
              .limit(1)
              .get();

            if (!itemsSnap.empty) {
              await itemsSnap.docs[0].ref.update({
                status: 'ERROR',
                statusDetail: errorMessage,
                lastSyncAttempt: Timestamp.now(),
              });
            }

            console.warn(
              `[Webhook] item/error for itemId ${itemId}: ${errorMessage}`
            );
          } else if (event === 'item/waiting_user_action') {
            const itemsSnap = await collections
              .pluggyItems(userId)
              .where('pluggyItemId', '==', itemId)
              .limit(1)
              .get();

            if (!itemsSnap.empty) {
              await itemsSnap.docs[0].ref.update({
                status: 'WAITING_USER_ACTION',
                lastSyncAttempt: Timestamp.now(),
              });
            }

            console.warn(`[Webhook] item/waiting_user_action for itemId ${itemId} — user action required`);
          } else {
            console.log(`[Webhook] Unhandled event: ${event}`);
          }
        } catch (asyncErr) {
          console.error(`[Webhook] Async processing error:`, asyncErr);
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
