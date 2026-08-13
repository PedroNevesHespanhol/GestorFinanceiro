import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { auth } from '../config/firebase';
import { upsertUser, getUser } from '../services/firestore';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

/**
 * POST /auth/google
 * Receives a Firebase ID token (after Google OAuth via Firebase Auth on the client).
 * Creates or updates the user document in Firestore.
 */
router.post(
  '/google',
  [
    body('idToken').notEmpty().withMessage('idToken is required'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { idToken } = req.body as { idToken: string };

      const decoded = await auth.verifyIdToken(idToken);

      const user = await upsertUser(decoded.uid, {
        email: decoded.email ?? '',
        name: decoded.name ?? decoded.email ?? '',
        googleId: decoded.firebase?.identities?.['google.com']?.[0] ?? decoded.uid,
      });

      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /auth/me
 * Returns the authenticated user's profile from Firestore.
 */
router.get(
  '/me',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const user = await getUser(userId);

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ user });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
