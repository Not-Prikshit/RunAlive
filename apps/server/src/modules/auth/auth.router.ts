// apps/server/src/modules/auth/auth.router.ts
// Express router for authentication endpoints.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import {
  RegisterSchema,
  LoginSchema,
  RefreshTokenSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from '@runalive/shared';
import * as authService from './auth.service.js';

export const authRouter = Router();

// Dedicated rate limiting for sensitive auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Please try again later.' } },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many password reset requests. Please try again later.' } },
});

// Helper for wrapping async handlers
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: err.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
        });
        return;
      }
      next(err);
    });
  };

/**
 * POST /api/v1/auth/register
 */
authRouter.post(
  '/register',
  authLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const input = RegisterSchema.parse(req.body);
    const result = await authService.register(input);
    res.status(201).json(result);
  })
);

/**
 * POST /api/v1/auth/login
 */
authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const input = LoginSchema.parse(req.body);
    const result = await authService.login(input);
    res.status(200).json(result);
  })
);

/**
 * POST /api/v1/auth/refresh
 */
authRouter.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const input = RefreshTokenSchema.parse(req.body);
    const result = await authService.refresh(input.refreshToken);
    res.status(200).json(result);
  })
);

/**
 * POST /api/v1/auth/logout
 */
authRouter.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = RefreshTokenSchema.safeParse(req.body);
    if (parsed.success) {
      await authService.logout(parsed.data.refreshToken);
    }
    res.status(200).json({ success: true });
  })
);

/**
 * POST /api/v1/auth/forgot-password
 */
authRouter.post(
  '/forgot-password',
  forgotPasswordLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const input = ForgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(input.email);
    res.status(200).json({
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  })
);

/**
 * POST /api/v1/auth/reset-password
 */
authRouter.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const input = ResetPasswordSchema.parse(req.body);
    await authService.resetPassword(input.token, input.password);
    res.status(200).json({ success: true });
  })
);
