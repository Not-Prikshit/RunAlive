// apps/server/src/test/catches.test.ts
// Unit and integration tests for Catch Verification, Win Conditions, and Match Results

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import {
  CatchReportStatus,
  CatchVerificationMode,
  PlayerRole,
  PlayerStatus,
  GameStatus,
  GameWinner,
} from '@runalive/shared';
import { createApp } from '../app.js';
import * as pool from '../db/pool.js';
import * as authService from '../modules/auth/auth.service.js';
import * as engineService from '../modules/games/engine.service.js';

describe('Catch Verification & Results Pipeline', () => {
  let app: ReturnType<typeof createApp>;

  const gameId = '11111111-1111-1111-1111-111111111111';
  const hostId = '00000000-0000-0000-0000-000000000000';
  const seekerId = '22222222-2222-2222-2222-222222222222';
  const runnerId = '33333333-3333-3333-3333-333333333333';
  const catchId = '44444444-4444-4444-4444-444444444444';
  const idempotencyKey = '55555555-5555-5555-5555-555555555555';

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  describe('POST /api/v1/games/:id/catches (Submit Catch)', () => {
    it('creates a PENDING catch report when submitted by an active seeker', async () => {
      vi.spyOn(authService, 'verifyAccessToken').mockResolvedValue({
        sub: seekerId,
        email: 'seeker@runalive.test',
        displayName: 'Seeker One',
      });

      vi.spyOn(pool, 'query').mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes('FROM catch_reports WHERE idempotency_key = $1')) {
          return Promise.resolve({ rows: [] } as any);
        }
        if (sql.includes('SELECT status, host_user_id, state_version FROM games')) {
          return Promise.resolve({
            rows: [{ status: GameStatus.ACTIVE, host_user_id: hostId, state_version: 2 }],
          } as any);
        }
        if (sql.includes('FROM game_players') && params?.[1] === seekerId) {
          return Promise.resolve({
            rows: [{ role: PlayerRole.SEEKER, status: PlayerStatus.ACTIVE }],
          } as any);
        }
        if (sql.includes('FROM game_players gp') && params?.[1] === runnerId) {
          return Promise.resolve({
            rows: [{ role: PlayerRole.RUNNER, status: PlayerStatus.ACTIVE, display_name: 'Runner One' }],
          } as any);
        }
        if (sql.includes("status = 'PENDING'")) {
          return Promise.resolve({ rows: [] } as any);
        }
        if (sql.includes('INSERT INTO catch_reports')) {
          return Promise.resolve({
            rows: [
              {
                id: catchId,
                runner_user_id: runnerId,
                seeker_user_id: seekerId,
                status: CatchReportStatus.PENDING,
                created_at: new Date(),
              },
            ],
          } as any);
        }
        return Promise.resolve({ rows: [] } as any);
      });

      const res = await request(app)
        .post(`/api/v1/games/${gameId}/catches`)
        .set('Authorization', 'Bearer valid-token')
        .send({
          runnerId,
          idempotencyKey,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(catchId);
      expect(res.body.runnerId).toBe(runnerId);
      expect(res.body.seekerId).toBe(seekerId);
      expect(res.body.status).toBe(CatchReportStatus.PENDING);
    });

    it('returns existing catch report idempotently when duplicate idempotencyKey is used', async () => {
      vi.spyOn(authService, 'verifyAccessToken').mockResolvedValue({
        sub: seekerId,
        email: 'seeker@runalive.test',
        displayName: 'Seeker One',
      });

      vi.spyOn(pool, 'query').mockImplementation((text: string) => {
        const sql = text.replace(/\s+/g, ' ');
        if (sql.includes('FROM catch_reports WHERE idempotency_key = $1')) {
          return Promise.resolve({
            rows: [
              {
                id: catchId,
                runner_user_id: runnerId,
                seeker_user_id: seekerId,
                status: CatchReportStatus.PENDING,
                created_at: new Date('2026-11-03T00:00:00.000Z'),
              },
            ],
          } as any);
        }
        return Promise.resolve({ rows: [] } as any);
      });

      const res = await request(app)
        .post(`/api/v1/games/${gameId}/catches`)
        .set('Authorization', 'Bearer valid-token')
        .send({
          runnerId,
          idempotencyKey,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(catchId);
      expect(res.body.status).toBe(CatchReportStatus.PENDING);
    });

    it('rejects submission with 409 if runner already has a pending catch report', async () => {
      vi.spyOn(authService, 'verifyAccessToken').mockResolvedValue({
        sub: seekerId,
        email: 'seeker@runalive.test',
        displayName: 'Seeker One',
      });

      vi.spyOn(pool, 'query').mockImplementation((text: string, params?: unknown[]) => {
        const sql = text.replace(/\s+/g, ' ');
        if (sql.includes('FROM catch_reports WHERE idempotency_key = $1')) {
          return Promise.resolve({ rows: [] } as any);
        }
        if (sql.includes('SELECT status, host_user_id, state_version FROM games')) {
          return Promise.resolve({
            rows: [{ status: GameStatus.ACTIVE, host_user_id: hostId, state_version: 2 }],
          } as any);
        }
        if (sql.includes('FROM game_players') && params?.[1] === seekerId) {
          return Promise.resolve({
            rows: [{ role: PlayerRole.SEEKER, status: PlayerStatus.ACTIVE }],
          } as any);
        }
        if (sql.includes('FROM game_players gp') && params?.[1] === runnerId) {
          return Promise.resolve({
            rows: [{ role: PlayerRole.RUNNER, status: PlayerStatus.ACTIVE, display_name: 'Runner One' }],
          } as any);
        }
        if (sql.includes("status = 'PENDING'")) {
          return Promise.resolve({ rows: [{ id: 'prior-pending-catch' }] } as any);
        }
        return Promise.resolve({ rows: [] } as any);
      });

      const res = await request(app)
        .post(`/api/v1/games/${gameId}/catches`)
        .set('Authorization', 'Bearer valid-token')
        .send({
          runnerId,
          idempotencyKey: '66666666-6666-6666-6666-666666666666',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CATCH_ALREADY_PENDING');
    });
  });

  describe('POST /api/v1/games/:id/catches/:cid/confirm (Confirm Catch)', () => {
    it('confirms catch, eliminates runner, and triggers Seekers victory when 0 runners remain', async () => {
      vi.spyOn(authService, 'verifyAccessToken').mockResolvedValue({
        sub: runnerId,
        email: 'runner@runalive.test',
        displayName: 'Runner One',
      });

      const endGameSpy = vi.spyOn(engineService, 'endGame').mockResolvedValue();

      vi.spyOn(pool, 'withTransaction').mockImplementation(async (fn: any) => {
        const mockClient = {
          query: vi.fn().mockImplementation((text: string) => {
            const sql = text.replace(/\s+/g, ' ');
            if (sql.includes('FROM catch_reports WHERE id = $1')) {
              return Promise.resolve({
                rows: [
                  {
                    id: catchId,
                    runner_user_id: runnerId,
                    seeker_user_id: seekerId,
                    status: CatchReportStatus.PENDING,
                    created_at: new Date(),
                  },
                ],
              });
            }
            if (sql.includes('FROM games WHERE id = $1')) {
              return Promise.resolve({
                rows: [
                  {
                    host_user_id: hostId,
                    catch_verification_mode: CatchVerificationMode.RUNNER_OR_HOST,
                    state_version: 4,
                  },
                ],
              });
            }
            if (sql.includes('UPDATE catch_reports SET status = \'CONFIRMED\'')) {
              return Promise.resolve({
                rows: [
                  {
                    id: catchId,
                    runner_user_id: runnerId,
                    seeker_user_id: seekerId,
                    status: CatchReportStatus.CONFIRMED,
                    created_at: new Date(),
                  },
                ],
              });
            }
            if (sql.includes('SELECT display_name FROM users')) {
              return Promise.resolve({ rows: [{ display_name: 'Runner One' }] });
            }
            if (sql.includes('UPDATE games SET state_version')) {
              return Promise.resolve({ rows: [{ state_version: 5 }] });
            }
            if (sql.includes('FILTER (WHERE status = \'ACTIVE\') AS remaining')) {
              // 0 runners remaining!
              return Promise.resolve({ rows: [{ remaining: '0', total: '4' }] });
            }
            return Promise.resolve({ rows: [] });
          }),
        };
        return fn(mockClient);
      });

      const res = await request(app)
        .post(`/api/v1/games/${gameId}/catches/${catchId}/confirm`)
        .set('Authorization', 'Bearer valid-token')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(CatchReportStatus.CONFIRMED);
      expect(endGameSpy).toHaveBeenCalledWith(gameId, GameWinner.SEEKERS, expect.any(String));
    });

    it('rejects confirmation with 403 if mode is RUNNER_ONLY and actor is host', async () => {
      vi.spyOn(authService, 'verifyAccessToken').mockResolvedValue({
        sub: hostId,
        email: 'host@runalive.test',
        displayName: 'Host User',
      });

      vi.spyOn(pool, 'withTransaction').mockImplementation(async (fn: any) => {
        const mockClient = {
          query: vi.fn().mockImplementation((text: string) => {
            const sql = text.replace(/\s+/g, ' ');
            if (sql.includes('FROM catch_reports WHERE id = $1')) {
              return Promise.resolve({
                rows: [
                  {
                    id: catchId,
                    runner_user_id: runnerId,
                    seeker_user_id: seekerId,
                    status: CatchReportStatus.PENDING,
                    created_at: new Date(),
                  },
                ],
              });
            }
            if (sql.includes('FROM games WHERE id = $1')) {
              return Promise.resolve({
                rows: [
                  {
                    host_user_id: hostId,
                    catch_verification_mode: CatchVerificationMode.RUNNER_ONLY,
                    state_version: 4,
                  },
                ],
              });
            }
            return Promise.resolve({ rows: [] });
          }),
        };
        return fn(mockClient);
      });

      const res = await request(app)
        .post(`/api/v1/games/${gameId}/catches/${catchId}/confirm`)
        .set('Authorization', 'Bearer valid-token')
        .send();

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/v1/games/:id/catches/:cid/reject', () => {
    it('allows runner to reject pending catch report', async () => {
      vi.spyOn(authService, 'verifyAccessToken').mockResolvedValue({
        sub: runnerId,
        email: 'runner@runalive.test',
        displayName: 'Runner One',
      });

      vi.spyOn(pool, 'query').mockImplementation((sql: string) => {
        if (sql.includes('FROM catch_reports') && sql.includes('WHERE id = $1')) {
          return Promise.resolve({
            rows: [
              {
                id: catchId,
                runner_user_id: runnerId,
                seeker_user_id: seekerId,
                status: CatchReportStatus.PENDING,
                created_at: new Date(),
              },
            ],
          } as any);
        }
        if (sql.includes('host_user_id, state_version FROM games')) {
          return Promise.resolve({ rows: [{ host_user_id: hostId, state_version: 3 }] } as any);
        }
        if (sql.includes('UPDATE catch_reports') && sql.includes("'REJECTED'")) {
          return Promise.resolve({
            rows: [
              {
                id: catchId,
                runner_user_id: runnerId,
                seeker_user_id: seekerId,
                status: CatchReportStatus.REJECTED,
                created_at: new Date(),
              },
            ],
          } as any);
        }
        return Promise.resolve({ rows: [] } as any);
      });

      const res = await request(app)
        .post(`/api/v1/games/${gameId}/catches/${catchId}/reject`)
        .set('Authorization', 'Bearer valid-token')
        .send({ reason: 'Was not tagged' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(CatchReportStatus.REJECTED);
    });
  });

  describe('POST /api/v1/games/:id/catches/:cid/reverse', () => {
    it('allows host to reverse a confirmed catch and return runner to ACTIVE', async () => {
      vi.spyOn(authService, 'verifyAccessToken').mockResolvedValue({
        sub: hostId,
        email: 'host@runalive.test',
        displayName: 'Host User',
      });

      vi.spyOn(pool, 'query').mockImplementation((sql: string) => {
        if (sql.includes('SELECT host_user_id, status, state_version FROM games')) {
          return Promise.resolve({
            rows: [{ host_user_id: hostId, status: GameStatus.ACTIVE, state_version: 7 }],
          } as any);
        }
        return Promise.resolve({ rows: [] } as any);
      });

      vi.spyOn(pool, 'withTransaction').mockImplementation(async (fn: any) => {
        const mockClient = {
          query: vi.fn().mockImplementation((text: string) => {
            const sql = text.replace(/\s+/g, ' ');
            if (sql.includes('FROM catch_reports WHERE id = $1') || (sql.includes('FROM catch_reports') && sql.includes('id = $1'))) {
              return Promise.resolve({
                rows: [
                  {
                    id: catchId,
                    runner_user_id: runnerId,
                    seeker_user_id: seekerId,
                    status: CatchReportStatus.CONFIRMED,
                    created_at: new Date(),
                  },
                ],
              });
            }
            if (sql.includes('UPDATE catch_reports') && sql.includes("'REJECTED'")) {
              return Promise.resolve({
                rows: [
                  {
                    id: catchId,
                    runner_user_id: runnerId,
                    seeker_user_id: seekerId,
                    status: CatchReportStatus.REJECTED,
                    created_at: new Date(),
                  },
                ],
              });
            }
            if (sql.includes('UPDATE games SET state_version')) {
              return Promise.resolve({ rows: [{ state_version: 8 }] });
            }
            if (sql.includes('FILTER') && sql.includes('remaining')) {
              return Promise.resolve({ rows: [{ remaining: '2', total: '4' }] });
            }
            return Promise.resolve({ rows: [] });
          }),
        };
        return fn(mockClient);
      });

      const res = await request(app)
        .post(`/api/v1/games/${gameId}/catches/${catchId}/reverse`)
        .set('Authorization', 'Bearer valid-token')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(CatchReportStatus.REJECTED);
    });
  });

  describe('GET /api/v1/games/:id/results (Match Results)', () => {
    it('returns structured results and participations for a finished game', async () => {
      vi.spyOn(authService, 'verifyAccessToken').mockResolvedValue({
        sub: runnerId,
        email: 'runner@runalive.test',
        displayName: 'Runner One',
      });

      vi.spyOn(pool, 'query').mockImplementation((sql: string) => {
        if (sql.includes('FROM game_results') && sql.includes('game_id = $1')) {
          return Promise.resolve({
            rows: [
              {
                game_id: gameId,
                winner: GameWinner.RUNNERS,
                match_duration_seconds: 900,
                rounds_completed: 3,
                runners_caught: 1,
                runners_disqualified: 0,
                runners_remaining: 3,
                finished_at: new Date('2026-11-03T12:00:00.000Z'),
              },
            ],
          } as any);
        }
        if (sql.includes('FROM game_participations gp')) {
          return Promise.resolve({
            rows: [
              {
                game_id: gameId,
                game_name: 'Campus Showdown',
                role: PlayerRole.RUNNER,
                outcome: 'WIN',
                survival_seconds: 900,
                catches_made: 0,
                was_disqualified: false,
                created_at: new Date('2026-11-03T12:00:00.000Z'),
              },
            ],
          } as any);
        }
        return Promise.resolve({ rows: [] } as any);
      });

      const res = await request(app)
        .get(`/api/v1/games/${gameId}/results`)
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.winner).toBe(GameWinner.RUNNERS);
      expect(res.body.matchDurationSeconds).toBe(900);
      expect(res.body.runnersRemaining).toBe(3);
      expect(res.body.participations).toHaveLength(1);
      expect(res.body.participations[0].outcome).toBe('WIN');
    });
  });
});
