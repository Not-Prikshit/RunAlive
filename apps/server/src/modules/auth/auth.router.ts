// apps/server/src/modules/auth/auth.router.ts
// Auth endpoints — full implementation in Stage 2, stub for Stage 0 compile check

import { Router, type Request, type Response } from 'express';

export const authRouter = Router();

// All endpoints return 501 until Stage 2 implementation
const notImplemented = (_req: Request, res: Response) => {
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Stage 2' } });
};

authRouter.post('/register', notImplemented);
authRouter.post('/login', notImplemented);
authRouter.post('/refresh', notImplemented);
authRouter.post('/logout', notImplemented);
authRouter.post('/forgot-password', notImplemented);
authRouter.post('/reset-password', notImplemented);
