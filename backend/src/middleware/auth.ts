import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';

export interface AuthenticatedRequest extends Request {
  userId: string;
  userEmail: string;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = await auth.verifyIdToken(token);
    (req as AuthenticatedRequest).userId = decoded.uid;
    (req as AuthenticatedRequest).userEmail = decoded.email ?? '';
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
