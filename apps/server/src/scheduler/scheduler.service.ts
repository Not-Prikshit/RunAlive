// apps/server/src/scheduler/scheduler.service.ts
// Durable scheduled jobs service using PostgreSQL scheduled_jobs table

import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../db/pool.js';
import { logger } from '../logger.js';
import { JobType } from '@runalive/shared';

export interface ScheduledJobRow {
  id: string;
  type: JobType;
  game_id: string | null;
  payload: Record<string, unknown>;
  dedupe_key: string;
  due_at: Date;
  locked_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  error_message: string | null;
}

export type JobHandler = (job: ScheduledJobRow) => Promise<void>;

const jobHandlers = new Map<string, JobHandler>();

/**
 * Register a handler for a specific JobType.
 */
export function registerJobHandler(type: string, handler: JobHandler): void {
  jobHandlers.set(type, handler);
}

/**
 * Enqueue a durable scheduled job with idempotent dedupe key.
 */
export async function scheduleJob(
  type: JobType | string,
  dueAt: Date,
  options: {
    gameId?: string;
    payload?: Record<string, unknown>;
    dedupeKey?: string;
    client?: pg.PoolClient;
  } = {}
): Promise<string> {
  const dedupeKey = options.dedupeKey ?? `${type}:${options.gameId ?? 'global'}:${uuidv4()}`;
  const payload = JSON.stringify(options.payload ?? {});

  const runQuery = options.client ? options.client.query.bind(options.client) : query;
  const { rows } = await runQuery<{ id: string }>(
    `INSERT INTO scheduled_jobs (type, game_id, payload, dedupe_key, due_at)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (dedupe_key) DO UPDATE
       SET due_at = EXCLUDED.due_at,
           payload = EXCLUDED.payload,
           completed_at = NULL,
           failed_at = NULL
     RETURNING id`,
    [type, options.gameId ?? null, payload, dedupeKey, dueAt]
  );

  return rows[0]?.id ?? 'mock-job-id';
}

/**
 * Shift deadlines for all pending jobs of a game by deltaMs (used when resuming from pause).
 */
export async function shiftGameJobDeadlines(
  gameId: string,
  deltaMs: number,
  client?: pg.PoolClient
): Promise<void> {
  const runQuery = client ? (t: string, v?: unknown[]) => client.query(t, v) : query;
  await runQuery(
    `UPDATE scheduled_jobs
     SET due_at = due_at + ($1 || ' milliseconds')::INTERVAL
     WHERE game_id = $2
       AND completed_at IS NULL
       AND failed_at IS NULL`,
    [deltaMs, gameId]
  );
}

/**
 * Cancel / complete all pending jobs for a finished or cancelled game.
 */
export async function cancelGameJobs(gameId: string, client?: pg.PoolClient): Promise<void> {
  const runQuery = client ? (t: string, v?: unknown[]) => client.query(t, v) : query;
  await runQuery(
    `UPDATE scheduled_jobs
     SET completed_at = NOW()
     WHERE game_id = $1
       AND completed_at IS NULL
       AND failed_at IS NULL`,
    [gameId]
  );
}

/**
 * Poll and process due jobs using SELECT FOR UPDATE SKIP LOCKED.
 */
export async function processDueJobs(limit = 10): Promise<number> {
  return withTransaction(async (client) => {
    const { rows: dueJobs } = await client.query<ScheduledJobRow>(
      `SELECT id, type, game_id, payload, dedupe_key, due_at, locked_at, completed_at, failed_at, error_message
       FROM scheduled_jobs
       WHERE due_at <= NOW()
         AND completed_at IS NULL
         AND failed_at IS NULL
         AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '1 minute')
       ORDER BY due_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );

    if (dueJobs.length === 0) return 0;

    for (const job of dueJobs) {
      await client.query('UPDATE scheduled_jobs SET locked_at = NOW() WHERE id = $1', [job.id]);

      const handler = jobHandlers.get(job.type);
      if (!handler) {
        logger.warn({ jobType: job.type, jobId: job.id }, 'No handler registered for job type');
        await client.query(
          `UPDATE scheduled_jobs
           SET completed_at = NOW(), error_message = 'No handler registered'
           WHERE id = $1`,
          [job.id]
        );
        continue;
      }

      try {
        await handler(job);
        await client.query('UPDATE scheduled_jobs SET completed_at = NOW() WHERE id = $1', [
          job.id,
        ]);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err, jobId: job.id, jobType: job.type }, 'Error processing scheduled job');
        await client.query(
          'UPDATE scheduled_jobs SET failed_at = NOW(), error_message = $1 WHERE id = $2',
          [errorMsg, job.id]
        );
      }
    }

    return dueJobs.length;
  });
}
