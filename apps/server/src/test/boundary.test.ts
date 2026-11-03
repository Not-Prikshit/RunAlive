// apps/server/src/test/boundary.test.ts
// Stage 7 test suite: Boundary enforcement, conclusive fix rules, grace period lifecycle, host reversals

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import * as poolModule from '../db/pool.js';
import { signAccessToken } from '../modules/auth/auth.service.js';
import {
  checkPlayerBoundary,
  handleViolationDeadline,
  reverseDisqualification,
} from '../modules/boundary/boundary.service.js';
import { GameStatus, PlayerRole, PlayerStatus } from '@runalive/shared';

describe('Boundary Enforcement Engine', () => {
  const runnerUserId = '11111111-1111-1111-1111-111111111111';
  const gameId = '22222222-2222-2222-2222-222222222222';
  const hostUserId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores inconclusive fixes (accuracy > 50m) without triggering violations', async () => {
    let violationCreated = false;

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      if (text.includes('INSERT INTO boundary_violations')) {
        violationCreated = true;
      }
      return { rows: [] } as any;
    });

    // Fix is way outside, but accuracy is 75m > 50m threshold
    await checkPlayerBoundary(runnerUserId, gameId, {
      lat: 40.0,
      lon: -120.0,
      accuracyM: 75,
    });

    expect(violationCreated).toBe(false);
  });

  it('triggers an OPEN violation when conclusive fix is outside radius', async () => {
    let violationCreated = false;

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('FROM games g JOIN game_rounds gr')) {
        return {
          rows: [
            {
              status: GameStatus.ACTIVE,
              current_round: 1,
              violation_grace_seconds: 60,
              center_lat: 37.7749,
              center_lon: -122.4194,
              radius_m: 200, // 200 meter radius
            },
          ],
        } as any;
      }
      if (sql.includes('SELECT gp.role, gp.status, u.display_name FROM game_players gp')) {
        return {
          rows: [
            {
              role: PlayerRole.RUNNER,
              status: PlayerStatus.ACTIVE,
              display_name: 'Speedy',
            },
          ],
        } as any;
      }
      if (sql.includes('SELECT id, started_at, deadline_at FROM boundary_violations')) {
        return { rows: [] } as any; // No existing active violation
      }
      if (sql.includes('INSERT INTO boundary_violations')) {
        violationCreated = true;
        return { rows: [{ id: 'vio-123' }] } as any;
      }
      if (sql.includes('INSERT INTO scheduled_jobs')) {
        return { rows: [{ id: 'job-123' }] } as any;
      }
      return { rows: [] } as any;
    });

    // 37.7800 is ~567 meters away from 37.7749 > 200m radius!
    await checkPlayerBoundary(runnerUserId, gameId, {
      lat: 37.7800,
      lon: -122.4194,
      accuracyM: 15, // Conclusive fix <= 50m
    });

    expect(violationCreated).toBe(true);
  });

  it('clears active violation when runner re-enters boundary', async () => {
    let violationCleared = false;

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('FROM games g JOIN game_rounds gr')) {
        return {
          rows: [
            {
              status: GameStatus.ACTIVE,
              current_round: 1,
              violation_grace_seconds: 60,
              center_lat: 37.7749,
              center_lon: -122.4194,
              radius_m: 200,
            },
          ],
        } as any;
      }
      if (sql.includes('SELECT gp.role, gp.status, u.display_name FROM game_players gp')) {
        return {
          rows: [
            {
              role: PlayerRole.RUNNER,
              status: PlayerStatus.ACTIVE,
              display_name: 'Speedy',
            },
          ],
        } as any;
      }
      if (sql.includes('SELECT id, started_at, deadline_at FROM boundary_violations')) {
        return {
          rows: [
            {
              id: 'vio-existing',
              started_at: new Date(),
              deadline_at: new Date(Date.now() + 30000),
            },
          ],
        } as any;
      }
      if (sql.includes('UPDATE boundary_violations SET status = \'CLEARED\'')) {
        violationCleared = true;
        return { rows: [] } as any;
      }
      return { rows: [] } as any;
    });

    // Inside radius (exact center)
    await checkPlayerBoundary(runnerUserId, gameId, {
      lat: 37.7749,
      lon: -122.4194,
      accuracyM: 10,
    });

    expect(violationCleared).toBe(true);
  });

  it('disqualifies player when violation deadline expires', async () => {
    let playerDisqualified = false;

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('FROM boundary_violations WHERE id = $1')) {
        return {
          rows: [
            {
              id: 'vio-1',
              game_id: gameId,
              player_user_id: runnerUserId,
              status: 'OPEN',
            },
          ],
        } as any;
      }
      if (sql.includes('SELECT count(*) FROM game_players WHERE game_id = $1 AND role = \'RUNNER\'')) {
        return { rows: [{ count: '2' }] } as any; // 2 runners remaining
      }
      return { rows: [] } as any;
    });

    vi.spyOn(poolModule, 'withTransaction').mockImplementation(async (fn: any) => {
      const mockClient = {
        query: vi.fn().mockImplementation(async (text: string) => {
          const sql = text.replace(/\s+/g, ' ');
          if (sql.includes('UPDATE game_players SET status = \'DISQUALIFIED\'')) {
            playerDisqualified = true;
            return { rows: [] };
          }
          return { rows: [] };
        }),
      };
      return fn(mockClient);
    });

    await handleViolationDeadline('vio-1');
    expect(playerDisqualified).toBe(true);
  });
});

describe('Host Disqualification Reversal API (Supertest)', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  const hostUserId = '11111111-1111-1111-1111-111111111111';
  const gameId = '22222222-2222-2222-2222-222222222222';
  const violationId = '33333333-3333-3333-3333-333333333333';

  it('allows host to reverse a boundary disqualification', async () => {
    const hostToken = await signAccessToken({ userId: hostUserId, displayName: 'GameHost' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('SELECT host_user_id FROM games WHERE id = $1')) {
        return { rows: [{ host_user_id: hostUserId }] } as any;
      }
      if (sql.includes('FROM boundary_violations WHERE id = $1 AND game_id = $2')) {
        return {
          rows: [{ id: violationId, player_user_id: 'runner-1', status: 'DISQUALIFIED' }],
        } as any;
      }
      return { rows: [] } as any;
    });

    let playerRestored = false;
    vi.spyOn(poolModule, 'withTransaction').mockImplementation(async (fn: any) => {
      const mockClient = {
        query: vi.fn().mockImplementation(async (text: string) => {
          const sql = text.replace(/\s+/g, ' ');
          if (sql.includes('UPDATE game_players SET status = \'ACTIVE\'')) {
            playerRestored = true;
            return { rows: [] };
          }
          return { rows: [] };
        }),
      };
      return fn(mockClient);
    });

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/disqualifications/${violationId}/reverse`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(playerRestored).toBe(true);
  });
});
