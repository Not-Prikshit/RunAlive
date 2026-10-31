// apps/server/src/modules/games/games.router.ts
import { Router, type Request, type Response } from 'express';

export const gamesRouter = Router();

const notImplemented = (_req: Request, res: Response) => {
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Stage 3' } });
};

gamesRouter.post('/', notImplemented);
gamesRouter.get('/by-code/:code', notImplemented);
gamesRouter.get('/:id', notImplemented);
gamesRouter.patch('/:id/config', notImplemented);
gamesRouter.put('/:id/rounds', notImplemented);
gamesRouter.post('/:id/join', notImplemented);
gamesRouter.post('/:id/leave', notImplemented);
gamesRouter.post('/:id/ready', notImplemented);
gamesRouter.post('/:id/teams/assign', notImplemented);
gamesRouter.post('/:id/teams/randomize', notImplemented);
gamesRouter.post('/:id/kick', notImplemented);
gamesRouter.post('/:id/start', notImplemented);
gamesRouter.post('/:id/pause', notImplemented);
gamesRouter.post('/:id/resume', notImplemented);
gamesRouter.post('/:id/end', notImplemented);
gamesRouter.post('/:id/request-pause', notImplemented);
gamesRouter.post('/:id/location', notImplemented);
gamesRouter.post('/:id/catches', notImplemented);
gamesRouter.post('/:id/catches/:cid/confirm', notImplemented);
gamesRouter.post('/:id/catches/:cid/reject', notImplemented);
gamesRouter.post('/:id/catches/:cid/dispute', notImplemented);
gamesRouter.post('/:id/catches/:cid/reverse', notImplemented);
gamesRouter.get('/:id/disqualifications', notImplemented);
gamesRouter.post('/:id/disqualifications/:did/reverse', notImplemented);
gamesRouter.get('/:id/host-overview', notImplemented);
gamesRouter.get('/:id/results', notImplemented);
