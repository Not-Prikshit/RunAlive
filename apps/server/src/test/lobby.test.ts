// apps/server/src/test/lobby.test.ts
// Stage 3 test suite: Room code generation, Lobby lifecycle, team assignment, player ready

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import * as poolModule from '../db/pool.js';
import { generateRoomCode } from '../modules/games/games.service.js';
import { signAccessToken } from '../modules/auth/auth.service.js';
import { TeamAssignmentMethod, CatchVerificationMode, PlayerRole } from '@runalive/shared';

describe('Game Service — Room Code Generation', () => {
  it('generates a 6-character room code using unambiguous characters', async () => {
    vi.spyOn(poolModule, 'query').mockResolvedValue({ rows: [{ count: '0' }] } as any);

    const code = await generateRoomCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });
});

describe('Lobby Endpoints (Supertest)', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  const hostUserId = '11111111-1111-1111-1111-111111111111';
  const playerUserId = '22222222-2222-2222-2222-222222222222';
  const gameId = '33333333-3333-3333-3333-333333333333';

  it('POST /api/v1/games creates game and returns 201 with room code', async () => {
    const hostToken = await signAccessToken({ userId: hostUserId, displayName: 'GameHost' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('SELECT count(*) FROM games WHERE room_code')) {
        return { rows: [{ count: '0' }] } as any;
      }
      return { rows: [] } as any;
    });

    vi.spyOn(poolModule, 'withTransaction').mockImplementation(async (fn: any) => {
      const mockClient = {
        query: vi.fn().mockImplementation(async (text: string) => {
          const sql = text.replace(/\s+/g, ' ');
          if (sql.includes('INSERT INTO games')) {
            return {
              rows: [
                {
                  id: gameId,
                  room_code: 'XK92WP',
                  name: 'Quad Campus Hunt',
                  status: 'LOBBY',
                  host_user_id: hostUserId,
                  max_players: 20,
                  team_assignment_method: 'RANDOM',
                  host_participates: false,
                  seeker_count: null,
                  seeker_ratio: null,
                  announce_lead_seconds: 120,
                  runner_share_interval_seconds: 90,
                  violation_grace_seconds: 60,
                  catch_verification_mode: 'RUNNER_OR_HOST',
                  obfuscation_grid_m: 60,
                  location_loss_threshold_seconds: 90,
                  auto_eliminate_on_location_loss: false,
                  require_all_ready: true,
                  current_round: 0,
                  total_rounds: 1,
                  state_version: 1,
                  created_at: new Date('2025-01-01T00:00:00.000Z'),
                },
              ],
            };
          }
          if (sql.includes('SELECT display_name, avatar_url FROM users WHERE id = $1')) {
            return {
              rows: [{ display_name: 'GameHost', avatar_url: null }],
            };
          }
          return { rows: [] };
        }),
      };
      return fn(mockClient);
    });

    const res = await request(app)
      .post('/api/v1/games')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        config: {
          name: 'Quad Campus Hunt',
          maxPlayers: 20,
          teamAssignmentMethod: TeamAssignmentMethod.RANDOM,
          hostParticipates: false,
          announceLeadSeconds: 120,
          runnerShareIntervalSeconds: 90,
          violationGraceSeconds: 60,
          catchVerificationMode: CatchVerificationMode.RUNNER_OR_HOST,
          obfuscationGridM: 60,
          locationLossThresholdSeconds: 90,
          autoEliminateOnLocationLoss: false,
          requireAllReady: true,
        },
        rounds: [
          {
            roundNumber: 1,
            durationSeconds: 1200,
            centerLat: 37.7749,
            centerLon: -122.4194,
            radiusM: 400,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(gameId);
    expect(res.body.roomCode).toBe('XK92WP');
    expect(res.body.players).toHaveLength(1);
    expect(res.body.players[0].role).toBe(PlayerRole.HOST);
  });

  it('GET /api/v1/games/by-code/:code returns lobby preview', async () => {
    const playerToken = await signAccessToken({ userId: playerUserId, displayName: 'Player1' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('WHERE g.room_code = $1 AND g.status = \'LOBBY\'')) {
        return {
          rows: [
            {
              id: gameId,
              room_code: 'XK92WP',
              name: 'Quad Campus Hunt',
              status: 'LOBBY',
              max_players: 20,
              host_display_name: 'GameHost',
              player_count: '4',
            },
          ],
        } as any;
      }
      return { rows: [] } as any;
    });

    const res = await request(app)
      .get('/api/v1/games/by-code/XK92WP')
      .set('Authorization', `Bearer ${playerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.roomCode).toBe('XK92WP');
    expect(res.body.playerCount).toBe(4);
    expect(res.body.hostDisplayName).toBe('GameHost');
  });

  it('POST /api/v1/games/join adds player to lobby', async () => {
    const playerToken = await signAccessToken({ userId: playerUserId, displayName: 'RunnerJane' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('WHERE room_code = $1 AND status NOT IN (\'FINISHED\', \'CANCELLED\')')) {
        return {
          rows: [{ id: gameId, status: 'LOBBY', max_players: 20 }],
        } as any;
      }
      if (sql.includes('SELECT count(*) FROM game_players WHERE game_id = $1')) {
        return { rows: [{ count: '1' }] } as any;
      }
      if (sql.includes('SELECT id, status, role FROM game_players WHERE game_id = $1 AND user_id = $2')) {
        return { rows: [] } as any; // not already in game
      }
      if (sql.includes('FROM games WHERE id = $1')) {
        return {
          rows: [
            {
              id: gameId,
              room_code: 'XK92WP',
              name: 'Hunt',
              status: 'LOBBY',
              host_user_id: hostUserId,
              max_players: 20,
              team_assignment_method: 'RANDOM',
              host_participates: false,
              seeker_count: null,
              seeker_ratio: null,
              announce_lead_seconds: 120,
              runner_share_interval_seconds: 90,
              violation_grace_seconds: 60,
              catch_verification_mode: 'RUNNER_OR_HOST',
              obfuscation_grid_m: 60,
              location_loss_threshold_seconds: 90,
              auto_eliminate_on_location_loss: false,
              require_all_ready: true,
              current_round: 0,
              total_rounds: 1,
              state_version: 2,
              created_at: new Date(),
            },
          ],
        } as any;
      }
      if (sql.includes('FROM game_rounds WHERE game_id = $1')) {
        return { rows: [] } as any;
      }
      if (sql.includes('FROM game_players gp JOIN users u')) {
        return {
          rows: [
            {
              user_id: hostUserId,
              display_name: 'GameHost',
              avatar_url: null,
              role: 'HOST',
              status: 'ACTIVE',
              is_ready: false,
              connected: true,
              last_seen_at: new Date(),
            },
            {
              user_id: playerUserId,
              display_name: 'RunnerJane',
              avatar_url: null,
              role: 'RUNNER',
              status: 'ACTIVE',
              is_ready: false,
              connected: true,
              last_seen_at: new Date(),
            },
          ],
        } as any;
      }
      return { rows: [] } as any;
    });

    const res = await request(app)
      .post('/api/v1/games/join')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({
        roomCode: 'XK92WP',
        locationConsentAt: new Date().toISOString(),
      });

    expect(res.status).toBe(200);
    expect(res.body.player.userId).toBe(playerUserId);
    expect(res.body.player.role).toBe(PlayerRole.RUNNER);
    expect(res.body.game.players).toHaveLength(2);
  });

  it('POST /api/v1/games/:id/ready toggles player ready state', async () => {
    const playerToken = await signAccessToken({ userId: playerUserId, displayName: 'RunnerJane' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('SELECT status FROM games WHERE id = $1')) {
        return { rows: [{ status: 'LOBBY' }] } as any;
      }
      return { rows: [] } as any;
    });

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/ready`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ isReady: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/v1/games/:id/teams/assign allows host to change roles', async () => {
    const hostToken = await signAccessToken({ userId: hostUserId, displayName: 'GameHost' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('SELECT host_user_id, status FROM games WHERE id = $1')) {
        return { rows: [{ host_user_id: hostUserId, status: 'LOBBY' }] } as any;
      }
      return { rows: [] } as any;
    });

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/teams/assign`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ userId: playerUserId, role: 'SEEKER' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/v1/games/:id/kick prevents host from kicking self', async () => {
    const hostToken = await signAccessToken({ userId: hostUserId, displayName: 'GameHost' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('SELECT host_user_id, status FROM games WHERE id = $1')) {
        return { rows: [{ host_user_id: hostUserId, status: 'LOBBY' }] } as any;
      }
      return { rows: [] } as any;
    });

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/kick`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ userId: hostUserId });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TARGET');
  });

  it('POST /api/v1/games/:id/kick allows host to kick player', async () => {
    const hostToken = await signAccessToken({ userId: hostUserId, displayName: 'GameHost' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('SELECT host_user_id, status FROM games WHERE id = $1')) {
        return { rows: [{ host_user_id: hostUserId, status: 'LOBBY' }] } as any;
      }
      return { rows: [] } as any;
    });

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/kick`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ userId: playerUserId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
