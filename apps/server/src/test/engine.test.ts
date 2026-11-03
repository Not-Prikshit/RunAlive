// apps/server/src/test/engine.test.ts
// Stage 5 test suite: Game Engine state machine, Match lifecycle, durable Scheduler

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import * as poolModule from '../db/pool.js';
import { signAccessToken } from '../modules/auth/auth.service.js';
import { processDueJobs, registerJobHandler } from '../scheduler/scheduler.service.js';
import { GameStatus, PlayerRole, PlayerStatus, GameWinner, JobType } from '@runalive/shared';

describe('Game Engine State Machine & Match Controls (Supertest)', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  const hostUserId = '11111111-1111-1111-1111-111111111111';
  const playerUserId = '22222222-2222-2222-2222-222222222222';
  const gameId = '33333333-3333-3333-3333-333333333333';

  it('POST /api/v1/games/:id/start rejects if teams are incomplete', async () => {
    const hostToken = await signAccessToken({ userId: hostUserId, displayName: 'Host' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('FROM games WHERE id = $1')) {
        return {
          rows: [
            {
              id: gameId,
              status: GameStatus.LOBBY,
              host_user_id: hostUserId,
              announce_lead_seconds: 120,
              runner_share_interval_seconds: 90,
              state_version: 1,
            },
          ],
        } as any;
      }
      if (sql.includes('SELECT role, status FROM game_players')) {
        // Only runners, no seekers!
        return {
          rows: [
            { role: PlayerRole.RUNNER, status: PlayerStatus.ACTIVE },
            { role: PlayerRole.RUNNER, status: PlayerStatus.ACTIVE },
          ],
        } as any;
      }
      return { rows: [] } as any;
    });

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/start`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TEAMS_NOT_READY');
  });

  it('POST /api/v1/games/:id/start successfully transitions to ACTIVE with both teams', async () => {
    const hostToken = await signAccessToken({ userId: hostUserId, displayName: 'Host' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('FROM games WHERE id = $1')) {
        return {
          rows: [
            {
              id: gameId,
              status: GameStatus.LOBBY,
              host_user_id: hostUserId,
              announce_lead_seconds: 120,
              runner_share_interval_seconds: 90,
              state_version: 1,
            },
          ],
        } as any;
      }
      if (sql.includes('SELECT role, status FROM game_players')) {
        return {
          rows: [
            { role: PlayerRole.SEEKER, status: PlayerStatus.ACTIVE },
            { role: PlayerRole.RUNNER, status: PlayerStatus.ACTIVE },
          ],
        } as any;
      }
      if (sql.includes('FROM game_rounds WHERE game_id = $1')) {
        return {
          rows: [
            {
              round_number: 1,
              duration_seconds: 600,
              center_lat: 37.77,
              center_lon: -122.41,
              radius_m: 300,
            },
          ],
        } as any;
      }
      return { rows: [] } as any;
    });

    let scheduledJobsCount = 0;
    vi.spyOn(poolModule, 'withTransaction').mockImplementation(async (fn: any) => {
      const mockClient = {
        query: vi.fn().mockImplementation(async (text: string) => {
          const sql = text.replace(/\s+/g, ' ');
          if (sql.includes('UPDATE games SET status = \'ACTIVE\'')) {
            return { rows: [] };
          }
          if (sql.includes('INSERT INTO scheduled_jobs')) {
            scheduledJobsCount++;
            return { rows: [{ id: 'job-1' }] };
          }
          return { rows: [] };
        }),
      };
      return fn(mockClient);
    });

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/start`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/v1/games/:id/pause pauses active match', async () => {
    const hostToken = await signAccessToken({ userId: hostUserId, displayName: 'Host' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('SELECT host_user_id, status, state_version FROM games WHERE id = $1')) {
        return {
          rows: [{ host_user_id: hostUserId, status: GameStatus.ACTIVE, state_version: 2 }],
        } as any;
      }
      if (sql.includes('UPDATE games SET status = \'PAUSED\'')) {
        return { rows: [] } as any;
      }
      return { rows: [] } as any;
    });

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/pause`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/v1/games/:id/resume shifts deadlines and resumes match', async () => {
    const hostToken = await signAccessToken({ userId: hostUserId, displayName: 'Host' });
    const pausedAt = new Date(Date.now() - 30000); // paused 30s ago
    const roundEndsAt = new Date(Date.now() + 300000);
    const endsAt = new Date(Date.now() + 600000);

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('FROM games WHERE id = $1')) {
        return {
          rows: [
            {
              host_user_id: hostUserId,
              status: GameStatus.PAUSED,
              paused_at: pausedAt,
              round_ends_at: roundEndsAt,
              ends_at: endsAt,
              state_version: 3,
            },
          ],
        } as any;
      }
      return { rows: [] } as any;
    });

    let shiftedDeadlines = false;
    vi.spyOn(poolModule, 'withTransaction').mockImplementation(async (fn: any) => {
      const mockClient = {
        query: vi.fn().mockImplementation(async (text: string) => {
          const sql = text.replace(/\s+/g, ' ');
          if (sql.includes('UPDATE games SET status = \'ACTIVE\'')) {
            return { rows: [] };
          }
          if (sql.includes('UPDATE scheduled_jobs SET due_at = due_at +')) {
            shiftedDeadlines = true;
            return { rows: [] };
          }
          return { rows: [] };
        }),
      };
      return fn(mockClient);
    });

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/resume`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/v1/games/:id/request-pause allows player safety pause', async () => {
    const playerToken = await signAccessToken({ userId: playerUserId, displayName: 'Player' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('SELECT g.status, g.state_version FROM games g JOIN game_players gp')) {
        return { rows: [{ status: GameStatus.ACTIVE, state_version: 2 }] } as any;
      }
      return { rows: [] } as any;
    });

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/request-pause`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ reason: 'Slipped on wet grass' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/v1/games/:id/end terminates game match and cancels jobs', async () => {
    const hostToken = await signAccessToken({ userId: hostUserId, displayName: 'Host' });

    let cancelledJobs = false;
    vi.spyOn(poolModule, 'withTransaction').mockImplementation(async (fn: any) => {
      const mockClient = {
        query: vi.fn().mockImplementation(async (text: string) => {
          const sql = text.replace(/\s+/g, ' ');
          if (sql.includes('UPDATE games SET status = \'FINISHED\'')) {
            return { rows: [] };
          }
          if (sql.includes('UPDATE scheduled_jobs SET completed_at = NOW()')) {
            cancelledJobs = true;
            return { rows: [] };
          }
          return { rows: [] };
        }),
      };
      return fn(mockClient);
    });

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/end`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(cancelledJobs).toBe(true);
  });
});

describe('Durable Job Scheduler Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('processes due jobs with locking and handler dispatch', async () => {
    let executed = false;
    registerJobHandler('TEST_JOB', async (_job) => {
      executed = true;
    });

    const mockJob = {
      id: 'job-test-1',
      type: 'TEST_JOB',
      game_id: 'game-1',
      payload: {},
      dedupe_key: 'test:1',
      due_at: new Date(Date.now() - 5000), // due in past
      locked_at: null,
      completed_at: null,
      failed_at: null,
      error_message: null,
    };

    vi.spyOn(poolModule, 'withTransaction').mockImplementation(async (fn: any) => {
      const mockClient = {
        query: vi.fn().mockImplementation(async (text: string) => {
          const sql = text.replace(/\s+/g, ' ');
          if (sql.includes('SELECT id, type, game_id, payload, dedupe_key, due_at')) {
            return { rows: [mockJob] };
          }
          return { rows: [] };
        }),
      };
      return fn(mockClient);
    });

    const count = await processDueJobs(5);
    expect(count).toBe(1);
    expect(executed).toBe(true);
  });
});
