// apps/server/src/modules/games/games.router.ts
// Express router for Game creation, Lobby management, and Match endpoints.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ZodError, z } from 'zod';
import {
  CreateGameSchema,
  JoinGameSchema,
  TeamAssignSchema,
  KickPlayerSchema,
  RandomizeTeamsSchema,
  LocationBatchSchema,
  SubmitCatchSchema,
} from '@runalive/shared';
import { requireAuth } from '../auth/auth.middleware.js';
import * as gamesService from './games.service.js';
import * as engineService from './engine.service.js';
import * as locationsService from '../locations/locations.service.js';
import * as boundaryService from '../boundary/boundary.service.js';
import * as catchesService from '../catches/catches.service.js';

export const gamesRouter = Router();

// All game management routes require authentication
gamesRouter.use(requireAuth);

const param = (req: Request, key: string): string => {
  const val = req.params[key];
  if (Array.isArray(val)) return val[0] ?? '';
  return val ?? '';
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          },
        });
        return;
      }
      next(err);
    });
  };

/**
 * POST /api/v1/games
 * Create a new game with room code and initial rounds
 */
gamesRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const input = CreateGameSchema.parse(req.body);
    const game = await gamesService.createGame(req.user!.id, input);
    res.status(201).json(game);
  })
);

/**
 * GET /api/v1/games/by-code/:code
 * Public preview of lobby before joining
 */
gamesRouter.get(
  '/by-code/:code',
  asyncHandler(async (req: Request, res: Response) => {
    const preview = await gamesService.getGameByCode(param(req, 'code'));
    res.status(200).json(preview);
  })
);

/**
 * GET /api/v1/games/:id
 * Full game details & player roster
 */
gamesRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const game = await gamesService.getGameById(param(req, 'id'));
    res.status(200).json(game);
  })
);

/**
 * POST /api/v1/games/join
 * Join game using room code
 */
gamesRouter.post(
  '/join',
  asyncHandler(async (req: Request, res: Response) => {
    const input = JoinGameSchema.parse(req.body);
    const result = await gamesService.joinGame(req.user!.id, input);
    res.status(200).json(result);
  })
);

/**
 * POST /api/v1/games/:id/join
 * Join game using game ID route
 */
gamesRouter.post(
  '/:id/join',
  asyncHandler(async (req: Request, res: Response) => {
    const input = JoinGameSchema.parse(req.body);
    const result = await gamesService.joinGame(req.user!.id, input);
    res.status(200).json(result);
  })
);

/**
 * POST /api/v1/games/:id/leave
 * Leave game lobby
 */
gamesRouter.post(
  '/:id/leave',
  asyncHandler(async (req: Request, res: Response) => {
    await gamesService.leaveGame(req.user!.id, param(req, 'id'));
    res.status(200).json({ success: true });
  })
);

/**
 * POST /api/v1/games/:id/ready
 * Toggle ready status in lobby
 */
gamesRouter.post(
  '/:id/ready',
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({ isReady: z.boolean().default(true) });
    const { isReady } = schema.parse(req.body);
    await gamesService.setReady(req.user!.id, param(req, 'id'), isReady);
    res.status(200).json({ success: true });
  })
);

/**
 * POST /api/v1/games/:id/teams/assign
 * Host manually assigns a player role
 */
gamesRouter.post(
  '/:id/teams/assign',
  asyncHandler(async (req: Request, res: Response) => {
    const input = TeamAssignSchema.parse(req.body);
    await gamesService.assignRole(req.user!.id, param(req, 'id'), input.userId, input.role);
    res.status(200).json({ success: true });
  })
);

/**
 * POST /api/v1/games/:id/teams/randomize
 * Host randomizes teams based on seeker count/ratio
 */
gamesRouter.post(
  '/:id/teams/randomize',
  asyncHandler(async (req: Request, res: Response) => {
    const input = RandomizeTeamsSchema.optional().parse(req.body || {});
    await gamesService.randomizeTeams(req.user!.id, param(req, 'id'), input);
    res.status(200).json({ success: true });
  })
);

/**
 * POST /api/v1/games/:id/kick
 * Host kicks a player from lobby
 */
gamesRouter.post(
  '/:id/kick',
  asyncHandler(async (req: Request, res: Response) => {
    const input = KickPlayerSchema.parse(req.body);
    await gamesService.kickPlayer(req.user!.id, param(req, 'id'), input.userId);
    res.status(200).json({ success: true });
  })
);

/**
 * POST /api/v1/games/:id/start
 * Host starts match
 */
gamesRouter.post(
  '/:id/start',
  asyncHandler(async (req: Request, res: Response) => {
    await engineService.startGame(req.user!.id, param(req, 'id'));
    res.status(200).json({ success: true });
  })
);

/**
 * POST /api/v1/games/:id/pause
 * Host pauses match
 */
gamesRouter.post(
  '/:id/pause',
  asyncHandler(async (req: Request, res: Response) => {
    await engineService.pauseGame(req.user!.id, param(req, 'id'));
    res.status(200).json({ success: true });
  })
);

/**
 * POST /api/v1/games/:id/resume
 * Host resumes match
 */
gamesRouter.post(
  '/:id/resume',
  asyncHandler(async (req: Request, res: Response) => {
    await engineService.resumeGame(req.user!.id, param(req, 'id'));
    res.status(200).json({ success: true });
  })
);

/**
 * POST /api/v1/games/:id/end
 * Host ends match early
 */
gamesRouter.post(
  '/:id/end',
  asyncHandler(async (req: Request, res: Response) => {
    await engineService.endGame(param(req, 'id'));
    res.status(200).json({ success: true });
  })
);

/**
 * POST /api/v1/games/:id/request-pause
 * Player emergency pause
 */
gamesRouter.post(
  '/:id/request-pause',
  asyncHandler(async (req: Request, res: Response) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    await engineService.emergencyPause(req.user!.id, param(req, 'id'), reason);
    res.status(200).json({ success: true });
  })
);

// ── Stubs for future stages ──────────────────────────────────────────────────
const notImplemented = (_req: Request, res: Response) => {
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in subsequent stage' } });
};

gamesRouter.patch('/:id/config', notImplemented);
gamesRouter.put('/:id/rounds', notImplemented);
/**
 * POST /api/v1/games/:id/location
 * Ingest location fix batch from active player
 */
gamesRouter.post(
  '/:id/location',
  asyncHandler(async (req: Request, res: Response) => {
    const batch = LocationBatchSchema.parse(req.body);
    const result = await locationsService.recordLocationBatch(req.user!.id, param(req, 'id'), batch);
    res.status(200).json(result);
  })
);
/**
 * POST /api/v1/games/:id/catches
 * Seeker submits catch report with idempotency key
 */
gamesRouter.post(
  '/:id/catches',
  asyncHandler(async (req: Request, res: Response) => {
    const input = SubmitCatchSchema.parse(req.body);
    const report = await catchesService.submitCatch(req.user!.id, param(req, 'id'), input);
    res.status(201).json(report);
  })
);

/**
 * GET /api/v1/games/:id/catches
 * List all catch reports for a game
 */
gamesRouter.get(
  '/:id/catches',
  asyncHandler(async (req: Request, res: Response) => {
    const reports = await catchesService.getGameCatches(param(req, 'id'));
    res.status(200).json({ catches: reports });
  })
);

/**
 * POST /api/v1/games/:id/catches/:cid/confirm
 * Confirm catch report (Runner or Host depending on catchVerificationMode)
 */
gamesRouter.post(
  '/:id/catches/:cid/confirm',
  asyncHandler(async (req: Request, res: Response) => {
    const report = await catchesService.confirmCatch(req.user!.id, param(req, 'id'), param(req, 'cid'));
    res.status(200).json(report);
  })
);

/**
 * POST /api/v1/games/:id/catches/:cid/reject
 * Reject catch report (Runner or Host)
 */
gamesRouter.post(
  '/:id/catches/:cid/reject',
  asyncHandler(async (req: Request, res: Response) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    const report = await catchesService.rejectCatch(req.user!.id, param(req, 'id'), param(req, 'cid'), reason);
    res.status(200).json(report);
  })
);

/**
 * POST /api/v1/games/:id/catches/:cid/dispute
 * Dispute catch report (Runner)
 */
gamesRouter.post(
  '/:id/catches/:cid/dispute',
  asyncHandler(async (req: Request, res: Response) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    const report = await catchesService.disputeCatch(req.user!.id, param(req, 'id'), param(req, 'cid'), reason);
    res.status(200).json(report);
  })
);

/**
 * POST /api/v1/games/:id/catches/:cid/reverse
 * Host reverses a confirmed catch
 */
gamesRouter.post(
  '/:id/catches/:cid/reverse',
  asyncHandler(async (req: Request, res: Response) => {
    const report = await catchesService.reverseCatch(req.user!.id, param(req, 'id'), param(req, 'cid'));
    res.status(200).json(report);
  })
);
/**
 * GET /api/v1/games/:id/disqualifications
 * List match disqualifications
 */
gamesRouter.get(
  '/:id/disqualifications',
  asyncHandler(async (req: Request, res: Response) => {
    const list = await boundaryService.getGameDisqualifications(param(req, 'id'));
    res.status(200).json({ disqualifications: list });
  })
);

/**
 * POST /api/v1/games/:id/disqualifications/:did/reverse
 * Host reverses a boundary disqualification
 */
gamesRouter.post(
  '/:id/disqualifications/:did/reverse',
  asyncHandler(async (req: Request, res: Response) => {
    await boundaryService.reverseDisqualification(
      req.user!.id,
      param(req, 'id'),
      param(req, 'did')
    );
    res.status(200).json({ success: true });
  })
);
gamesRouter.get('/:id/host-overview', notImplemented);
/**
 * GET /api/v1/games/:id/results
 * Fetch final match results & participations
 */
gamesRouter.get(
  '/:id/results',
  asyncHandler(async (req: Request, res: Response) => {
    const results = await engineService.getGameResults(param(req, 'id'));
    res.status(200).json(results);
  })
);
