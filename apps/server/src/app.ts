// apps/server/src/app.ts
// Express application factory — separated from http server for testability.

import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import { logger } from './logger.js';
import { pool } from './db/pool.js';

// ─── Route imports (added progressively per stage) ───────────────────────────
import { healthRouter } from './modules/health/health.router.js';
import { authRouter } from './modules/auth/auth.router.js';
import { meRouter } from './modules/users/me.router.js';
import { gamesRouter } from './modules/games/games.router.js';

// ─── Error types ──────────────────────────────────────────────────────────────
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function createApp() {
  const app = express();

  // ── Security middleware ──────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: [
            "'self'",
            'data:',
            'blob:',
            'https://*.google.com',
            'https://google.com',
            'https://*.googleapis.com',
            'https://*.gstatic.com',
          ],
          connectSrc: ["'self'", 'ws:', 'wss:', 'http:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        // In development, allow local network device testing (e.g. mobile phones on Wi-Fi)
        if (!origin || config.NODE_ENV !== 'production') {
          callback(null, true);
        } else {
          const allowed = config.CORS_ORIGINS.split(',').map((o) => o.trim());
          callback(null, allowed.includes(origin));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  );

  // ── Body parsing ─────────────────────────────────────────────────────────
  app.use(express.json({ limit: '100kb' }));

  // ── Request logging ──────────────────────────────────────────────────────
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug({ method: req.method, url: req.url }, 'incoming request');
    next();
  });

  // ── Global rate limit (loose — per-route limits are tighter) ─────────────
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
    })
  );

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use('/healthz', healthRouter);
  app.use('/health', healthRouter);
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/me', meRouter);
  app.use('/api/v1/games', gamesRouter);

  // ── Static Web Frontend (Single Unified Production / Preview Port) ─────────
  const candidates = [
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), 'dist'),
  ];
  const webDistPath = candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));

  if (webDistPath) {
    app.use(express.static(webDistPath));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/healthz') ||
        req.path.startsWith('/health')
      ) {
        return next();
      }
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
  }

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // ── Global error handler ──────────────────────────────────────────────────
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: { code: err.code, message: err.message },
      });
      return;
    }

    logger.error({ err, url: req.url, method: req.method }, 'unhandled error');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });

  return app;
}
