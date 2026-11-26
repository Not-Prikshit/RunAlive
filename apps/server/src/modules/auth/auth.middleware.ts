// apps/server/src/modules/auth/auth.middleware.ts
// Express middleware for JWT authentication

import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from './auth.service.js';

export interface AuthenticatedUser {
  id: string;
  displayName: string;
  email?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  try {
    const payload = await verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      displayName: payload.displayName,
    };
    next();
  } catch (_err) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' },
    });
  }
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    next();
    return;
  }

  try {
    const payload = await verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      displayName: payload.displayName,
    };
  } catch {
    // Ignore invalid token for optional auth
  }

  next();
}
