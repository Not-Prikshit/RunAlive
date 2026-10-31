// apps/server/src/modules/users/me.router.ts
import { Router, type Request, type Response } from 'express';

export const meRouter = Router();

const notImplemented = (_req: Request, res: Response) => {
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Stage 2' } });
};

meRouter.get('/', notImplemented);
meRouter.patch('/', notImplemented);
meRouter.post('/avatar', notImplemented);
meRouter.get('/history', notImplemented);
meRouter.get('/stats', notImplemented);
meRouter.delete('/', notImplemented);
