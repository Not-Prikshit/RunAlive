// apps/server/src/modules/health/health.router.ts
import { Router, type Request, type Response } from 'express';
import { pool } from '../../db/pool.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  const version = process.env['npm_package_version'] ?? '0.1.0';
  const serverTime = new Date().toISOString();

  try {
    const result = await pool.query<{ now: Date }>('SELECT NOW() as now');
    const dbTime = result.rows[0]?.now;
    res.status(200).json({
      status: 'ok',
      serverTime,
      dbTime: dbTime?.toISOString() ?? null,
      version,
    });
  } catch (_err) {
    res.status(503).json({
      status: 'degraded',
      serverTime,
      dbTime: null,
      version,
      error: 'Database unreachable',
    });
  }
});
