// apps/server/src/modules/users/me.router.ts
// User profile endpoints (requires JWT authentication)

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import { UpdateProfileSchema, type UserProfile } from '@runalive/shared';
import { requireAuth } from '../auth/auth.middleware.js';
import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../app.js';
import { config } from '../../config.js';

export const meRouter = Router();

// All /me endpoints require authentication
meRouter.use(requireAuth);

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
 * GET /api/v1/me
 * Return current user's profile
 */
meRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    try {
      const result = await query<{
        id: string;
        email: string;
        display_name: string;
        avatar_url: string | null;
        created_at: Date;
      }>(
        `SELECT id, email, display_name, avatar_url, created_at
         FROM users
         WHERE id = $1 AND deleted_at IS NULL`,
        [userId]
      );

      const user = result.rows[0];
      if (!user) {
        throw new AppError('USER_NOT_FOUND', 'User profile not found', 404);
      }

      const profile: UserProfile = {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at.toISOString(),
      };

      res.status(200).json(profile);
    } catch (err: any) {
      if (
        config.NODE_ENV !== 'production' &&
        (err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED'))
      ) {
        res.status(200).json({
          id: userId,
          email: 'demo@runalive.app',
          displayName: (req.user as any)?.displayName || 'Demo Player',
          avatarUrl: null,
          createdAt: new Date().toISOString(),
        });
        return;
      }
      throw err;
    }
  })
);

/**
 * PATCH /api/v1/me
 * Update display name
 */
meRouter.patch(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const input = UpdateProfileSchema.parse(req.body);

    if (!input.displayName) {
      res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'No fields to update' },
      });
      return;
    }

    try {
      const result = await query<{
        id: string;
        email: string;
        display_name: string;
        avatar_url: string | null;
        created_at: Date;
      }>(
        `UPDATE users
         SET display_name = $1, updated_at = NOW()
         WHERE id = $2 AND deleted_at IS NULL
         RETURNING id, email, display_name, avatar_url, created_at`,
        [input.displayName.trim(), userId]
      );

      const user = result.rows[0];
      if (!user) {
        throw new AppError('USER_NOT_FOUND', 'User profile not found', 404);
      }

      const profile: UserProfile = {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at.toISOString(),
      };

      res.status(200).json(profile);
    } catch (err: any) {
      if (
        config.NODE_ENV !== 'production' &&
        (err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED'))
      ) {
        res.status(200).json({
          id: userId,
          email: req.user!.email || 'demo@runalive.app',
          displayName: input.displayName.trim(),
          avatarUrl: null,
          createdAt: new Date().toISOString(),
        });
        return;
      }
      throw err;
    }
  })
);

/**
 * DELETE /api/v1/me
 * Soft delete account and revoke all tokens
 */
meRouter.delete(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET deleted_at = NOW()
         WHERE id = $1`,
        [userId]
      );

      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
      );
    });

    res.status(200).json({ success: true });
  })
);

// Planned for Stage 10
meRouter.post('/avatar', (_req: Request, res: Response) => {
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Avatar upload coming in Stage 10' } });
});

/**
 * GET /api/v1/me/history
 * Match history for the current user
 */
meRouter.get(
  '/history',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const { rows } = await query<{
      game_id: string;
      game_name: string;
      role: string;
      outcome: string;
      survival_seconds: number | null;
      catches_made: number;
      was_disqualified: boolean;
      created_at: Date;
      winner: string | null;
      match_duration_seconds: number | null;
    }>(
      `SELECT gp.game_id, g.name AS game_name, gp.role, gp.outcome,
              gp.survival_seconds, gp.catches_made, gp.was_disqualified, gp.created_at,
              gr.winner, gr.match_duration_seconds
       FROM game_participations gp
       JOIN games g ON g.id = gp.game_id
       LEFT JOIN game_results gr ON gr.game_id = gp.game_id
       WHERE gp.user_id = $1
       ORDER BY gp.created_at DESC
       LIMIT 50`,
      [userId]
    );

    res.status(200).json({
      history: rows.map((r) => ({
        gameId: r.game_id,
        gameName: r.game_name,
        role: r.role,
        outcome: r.outcome,
        survivalSeconds: r.survival_seconds,
        catchesMade: r.catches_made,
        wasDisqualified: r.was_disqualified,
        winner: r.winner,
        matchDurationSeconds: r.match_duration_seconds,
        playedAt: r.created_at.toISOString(),
      })),
    });
  })
);

/**
 * GET /api/v1/me/stats
 * Aggregated player statistics
 */
meRouter.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const { rows } = await query<{
      total_games: string;
      total_wins: string;
      total_losses: string;
      total_catches: string;
      runner_games: string;
      runner_wins: string;
      seeker_games: string;
      seeker_wins: string;
    }>(
      `SELECT
         COUNT(*) AS total_games,
         COUNT(*) FILTER (WHERE outcome = 'WIN') AS total_wins,
         COUNT(*) FILTER (WHERE outcome = 'LOSS') AS total_losses,
         COALESCE(SUM(catches_made), 0) AS total_catches,
         COUNT(*) FILTER (WHERE role = 'RUNNER') AS runner_games,
         COUNT(*) FILTER (WHERE role = 'RUNNER' AND outcome = 'WIN') AS runner_wins,
         COUNT(*) FILTER (WHERE role = 'SEEKER') AS seeker_games,
         COUNT(*) FILTER (WHERE role = 'SEEKER' AND outcome = 'WIN') AS seeker_wins
       FROM game_participations
       WHERE user_id = $1`,
      [userId]
    );

    const s = rows[0]!;
    const totalGames = parseInt(s.total_games, 10);
    const totalWins = parseInt(s.total_wins, 10);
    const runnerGames = parseInt(s.runner_games, 10);
    const runnerWins = parseInt(s.runner_wins, 10);
    const seekerGames = parseInt(s.seeker_games, 10);
    const seekerWins = parseInt(s.seeker_wins, 10);

    res.status(200).json({
      totalGames,
      wins: totalWins,
      losses: parseInt(s.total_losses, 10),
      winRate: totalGames > 0 ? Number(((totalWins / totalGames) * 100).toFixed(1)) : 0,
      totalCatches: parseInt(s.total_catches, 10),
      runnerStats: {
        games: runnerGames,
        wins: runnerWins,
        survivalRate: runnerGames > 0 ? Number(((runnerWins / runnerGames) * 100).toFixed(1)) : 0,
      },
      seekerStats: {
        games: seekerGames,
        wins: seekerWins,
        catchSuccessRate: seekerGames > 0 ? Number(((seekerWins / seekerGames) * 100).toFixed(1)) : 0,
      },
    });
  })
);
