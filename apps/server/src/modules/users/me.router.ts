// apps/server/src/modules/users/me.router.ts
// User profile endpoints (requires JWT authentication)

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import { UpdateProfileSchema, type UserProfile } from '@runalive/shared';
import { requireAuth } from '../auth/auth.middleware.js';
import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../app.js';

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

meRouter.get('/history', (_req: Request, res: Response) => {
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Match history coming in Stage 10' } });
});

meRouter.get('/stats', (_req: Request, res: Response) => {
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Player stats coming in Stage 10' } });
});
