// apps/server/src/modules/games/games.router.ts
// Express router for Game creation, Lobby management, and Match endpoints.

import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
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
import * as dangerService from '../danger/danger.service.js';
import { config } from '../../config.js';

export const gamesRouter = Router();

// All game management routes require authentication
gamesRouter.use(requireAuth);

const param = (req: Request, key: string): string => {
  const val = req.params[key];
  if (Array.isArray(val)) return val[0] ?? '';
  return val ?? '';
};

const normalizeRoomCode = (raw: string): string => {
  return raw.trim().replace(/^RUN-?/i, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
};

const ROOM_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 unambiguous chars

function generateRandomRoomCode(): string {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARSET[bytes[i]! % ROOM_CODE_CHARSET.length];
  }
  return code;
}

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
 * In-memory fallback mock games store for dev when PostgreSQL is unavailable
 */
const mockGames = new Map<string, any>();

/**
 * POST /api/v1/games
 * Create a new game with room code and initial rounds
 */
gamesRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const body: any = req.body || {};
    let createInput: any;

    if (body.config && body.rounds && Array.isArray(body.rounds)) {
      createInput = body;
    } else {
      const name = body.name || body.matchName || 'Campus Tag Match';
      const maxPlayers = Number(body.maxPlayers) || 16;
      const centerLat = Number(body.boundaryCenterLat ?? body.lat ?? 28.4595);
      const centerLon = Number(body.boundaryCenterLng ?? body.lng ?? 77.5135);
      const radiusM = Number(body.boundaryRadiusMeters ?? body.radius ?? 500);
      const totalRounds = Number(body.totalRounds ?? body.rounds ?? 1);
      const durationSeconds = (Number(body.roundDurationMinutes) || 15) * 60;

      const rounds = [];
      for (let r = 1; r <= totalRounds; r++) {
        rounds.push({
          roundNumber: r,
          durationSeconds: durationSeconds,
          centerLat: centerLat,
          centerLon: centerLon,
          radiusM: Math.max(50, Math.round(radiusM * Math.pow(0.75, r - 1))),
        });
      }

      createInput = {
        config: {
          name,
          maxPlayers,
          teamAssignmentMethod: 'RANDOM',
          hostParticipates: true,
          announceLeadSeconds: 120,
          runnerShareIntervalSeconds: 90,
          violationGraceSeconds: 60,
          catchVerificationMode: 'RUNNER_OR_HOST',
          obfuscationGridM: 60,
          locationLossThresholdSeconds: 90,
          autoEliminateOnLocationLoss: false,
          requireAllReady: false,
        },
        rounds,
      };
    }

    const input = CreateGameSchema.parse(createInput);
    try {
      const game = await gamesService.createGame(req.user!.id, input);
      const shape = (body.shape || body.boundaryShape || 'CIRCLE') as 'CIRCLE' | 'RECTANGLE' | 'POLYGON';
      const rectWidthMeters = Number(body.rectWidth ?? body.rectWidthMeters ?? 600);
      const rectHeightMeters = Number(body.rectHeight ?? body.rectHeightMeters ?? 600);
      const rectRotationDeg = Number(body.rectRotation ?? body.rectRotationDeg ?? 0);
      const polygonPoints = Array.isArray(body.polygonPoints) ? body.polygonPoints : [];
      const revealSeekersOnMap = body.revealSeekersOnMap !== undefined ? Boolean(body.revealSeekersOnMap) : true;

      gamesService.setGamePerimeter(game.id, {
        shape,
        rectWidthMeters,
        rectHeightMeters,
        rectRotationDeg,
        polygonPoints,
        revealSeekersOnMap,
      });

      res.status(201).json({
        ...game,
        game,
        gameId: game.id,
        boundaryShape: shape,
        rectWidthMeters,
        rectHeightMeters,
        rectRotationDeg,
        polygonPoints,
        revealSeekersOnMap,
      });
    } catch (err: any) {
      if (
        config.NODE_ENV !== 'production' &&
        (err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED'))
      ) {
        const gameId = crypto.randomUUID();
        let roomCode = generateRandomRoomCode();
        while (mockGames.has(roomCode)) {
          roomCode = generateRandomRoomCode();
        }

        const inputData: any = input;
        const name = inputData.config?.name || inputData.name || 'Campus Tag Match';
        const totalRounds = inputData.rounds?.length || inputData.totalRounds || 1;
        const boundaryCenterLat = inputData.rounds?.[0]?.centerLat ?? inputData.rounds?.[0]?.boundaryCenterLat ?? 28.4595;
        const boundaryCenterLng = inputData.rounds?.[0]?.centerLon ?? inputData.rounds?.[0]?.boundaryCenterLng ?? 77.5135;
        const boundaryRadiusMeters = inputData.rounds?.[0]?.radiusM ?? inputData.rounds?.[0]?.boundaryRadiusMeters ?? 500;
        
        const hostPlayer = {
          userId: req.user!.id,
          displayName: req.user!.displayName || 'Host Runner',
          avatarUrl: null,
          role: 'RUNNER',
          status: 'ACTIVE',
          isReady: true,
          isConnected: true,
          lastSeenAt: new Date().toISOString(),
        };

        const fallbackGame = {
          id: gameId,
          roomCode,
          name,
          status: 'LOBBY',
          hostUserId: req.user!.id,
          maxPlayers: inputData.config?.maxPlayers || 16,
          currentRound: 1,
          totalRounds,
          boundaryCenterLat,
          boundaryCenterLng,
          boundaryRadiusMeters,
          players: [hostPlayer],
          rounds: inputData.rounds || [],
          createdAt: new Date().toISOString(),
        };

        mockGames.set(gameId, fallbackGame);
        mockGames.set(roomCode, fallbackGame);
        res.status(201).json({ ...fallbackGame, game: fallbackGame, gameId });
        return;
      }
      throw err;
    }
  })
);

/**
 * GET /api/v1/games/by-code/:code
 * Public preview of lobby before joining
 */
gamesRouter.get(
  '/by-code/:code',
  asyncHandler(async (req: Request, res: Response) => {
    const rawCode = param(req, 'code');
    const cleanCode = normalizeRoomCode(rawCode);
    try {
      const preview = await gamesService.getGameByCode(cleanCode);
      res.status(200).json(preview);
    } catch (err: any) {
      if (
        config.NODE_ENV !== 'production' &&
        (err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED') || mockGames.has(cleanCode))
      ) {
        const g = mockGames.get(cleanCode);
        if (!g) {
          res.status(404).json({
            error: {
              code: 'GAME_NOT_FOUND',
              message: `No active match found for code ${cleanCode}`,
            },
          });
          return;
        }
        res.status(200).json({
          id: g.id,
          roomCode: g.roomCode,
          name: g.name,
          status: g.status,
          playerCount: g.players?.length || 1,
          maxPlayers: g.maxPlayers || 16,
        });
        return;
      }
      throw err;
    }
  })
);

/**
 * GET /api/v1/games/:id
 * Full game details & player roster
 */
gamesRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = param(req, 'id');
    try {
      const game = await gamesService.getGameById(id);
      res.status(200).json({ ...game, game });
    } catch (err: any) {
      if (
        config.NODE_ENV !== 'production' &&
        (err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED') || mockGames.has(id))
      ) {
        const g = mockGames.get(id);
        if (!g) {
          res.status(404).json({
            error: {
              code: 'GAME_NOT_FOUND',
              message: 'Game not found',
            },
          });
          return;
        }
        res.status(200).json({ game: g });
        return;
      }
      throw err;
    }
  })
);

/**
 * POST /api/v1/games/join
 * Join game using room code
 */
gamesRouter.post(
  '/join',
  asyncHandler(async (req: Request, res: Response) => {
    const body: any = req.body || {};
    const rawCode = body.roomCode || body.code || '';
    const cleanCode = normalizeRoomCode(rawCode);
    
    if (!cleanCode || cleanCode.length < 4) {
      res.status(400).json({
        error: {
          code: 'INVALID_CODE',
          message: 'Please provide a valid 6-character room code',
        },
      });
      return;
    }

    const payload = {
      roomCode: cleanCode.length === 6 ? cleanCode : cleanCode.padEnd(6, 'X'),
      locationConsentAt: body.locationConsentAt || new Date().toISOString(),
    };

    const input = JoinGameSchema.parse(payload);
    try {
      const result = await gamesService.joinGame(req.user!.id, input);
      res.status(200).json({ ...result, gameId: result.game.id });
    } catch (err: any) {
      if (
        config.NODE_ENV !== 'production' &&
        (err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED') || mockGames.has(cleanCode))
      ) {
        const game = mockGames.get(cleanCode);
        if (!game) {
          res.status(404).json({
            error: {
              code: 'GAME_NOT_FOUND',
              message: `No active match found for code ${cleanCode}`,
            },
          });
          return;
        }

        if (game.status !== 'LOBBY') {
          res.status(400).json({
            error: {
              code: 'GAME_ALREADY_STARTED',
              message: 'This match has already started and is no longer accepting new players.',
            },
          });
          return;
        }

        const existingPlayer = game.players?.find((p: any) => p.userId === req.user!.id);
        if (!existingPlayer) {
          if ((game.players?.length || 0) >= (game.maxPlayers || 16)) {
            res.status(400).json({
              error: {
                code: 'GAME_FULL',
                message: 'This match has reached maximum player capacity.',
              },
            });
            return;
          }

          game.players.push({
            userId: req.user!.id,
            displayName: req.user!.displayName || 'Player',
            avatarUrl: null,
            role: 'RUNNER',
            status: 'ACTIVE',
            isReady: false,
            isConnected: true,
            lastSeenAt: new Date().toISOString(),
          });
        }

        res.status(200).json({
          gameId: game.id,
          role: existingPlayer?.role || 'RUNNER',
          status: 'LOBBY',
          game,
        });
        return;
      }
      throw err;
    }
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
    const gameId = param(req, 'id');
    try {
      await gamesService.setReady(req.user!.id, gameId, isReady);
    } catch (err: any) {
      if (
        config.NODE_ENV !== 'production' &&
        (err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED') || mockGames.has(gameId))
      ) {
        const g = mockGames.get(gameId);
        if (g) {
          const p = g.players?.find((pl: any) => pl.userId === req.user!.id);
          if (p) p.isReady = isReady;
        }
      } else {
        throw err;
      }
    }
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
    const gameId = param(req, 'id');
    try {
      await gamesService.assignRole(req.user!.id, gameId, input.userId, input.role);
    } catch (err: any) {
      if (
        config.NODE_ENV !== 'production' &&
        (err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED') || mockGames.has(gameId))
      ) {
        const g = mockGames.get(gameId);
        if (g) {
          const p = g.players?.find((pl: any) => pl.userId === input.userId);
          if (p) p.role = input.role;
        }
      } else {
        throw err;
      }
    }
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
    const gameId = param(req, 'id');
    try {
      await gamesService.randomizeTeams(req.user!.id, gameId, input);
    } catch (err: any) {
      if (
        config.NODE_ENV !== 'production' &&
        (err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED') || mockGames.has(gameId))
      ) {
        const g = mockGames.get(gameId);
        if (g && Array.isArray(g.players) && g.players.length > 0) {
          const total = g.players.length;
          const seekersCount = Math.max(1, Math.floor(total / 3));
          g.players.forEach((p: any, idx: number) => {
            p.role = idx < seekersCount ? 'SEEKER' : 'RUNNER';
          });
        }
      } else {
        throw err;
      }
    }
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

gamesRouter.put(
  '/:id/perimeter',
  asyncHandler(async (req: Request, res: Response) => {
    const gameId = param(req, 'id');
    const body = req.body || {};
    const shape = (body.shape || body.boundaryShape || 'CIRCLE') as 'CIRCLE' | 'RECTANGLE' | 'POLYGON';
    const rectWidthMeters = Number(body.rectWidth ?? body.rectWidthMeters ?? 600);
    const rectHeightMeters = Number(body.rectHeight ?? body.rectHeightMeters ?? 600);
    const rectRotationDeg = Number(body.rectRotation ?? body.rectRotationDeg ?? 0);
    const polygonPoints = Array.isArray(body.polygonPoints) ? body.polygonPoints : [];
    const revealSeekersOnMap = body.revealSeekersOnMap !== undefined ? Boolean(body.revealSeekersOnMap) : true;

    gamesService.setGamePerimeter(gameId, {
      shape,
      rectWidthMeters,
      rectHeightMeters,
      rectRotationDeg,
      polygonPoints,
      revealSeekersOnMap,
    });
    res.status(200).json({ success: true, shape, rectWidthMeters, rectHeightMeters, rectRotationDeg, polygonPoints, revealSeekersOnMap });
  })
);

// ── Stubs for future stages ──────────────────────────────────────────────────
const notImplemented = (_req: Request, res: Response) => {
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Coming in subsequent stage' } });
};

gamesRouter.patch('/:id/config', notImplemented);
gamesRouter.put('/:id/rounds', notImplemented);
/**
 * GET /api/v1/games/:id/danger
 * Get current danger state for runner
 */
gamesRouter.get(
  '/:id/danger',
  asyncHandler(async (req: Request, res: Response) => {
    const danger = await dangerService.evaluateRunnerDanger(param(req, 'id'), req.user!.id);
    res.status(200).json({ danger });
  })
);

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
