// apps/server/src/test/location.test.ts
// Stage 6 test suite: Location pipeline, speed checks, grid obfuscation, snapshot broadcasts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import * as poolModule from '../db/pool.js';
import { signAccessToken } from '../modules/auth/auth.service.js';
import {
  haversineDistanceM,
  obfuscateCoordinates,
  broadcastRunnerSnapshots,
} from '../modules/locations/locations.service.js';
import { GameStatus, PlayerRole, PlayerStatus } from '@runalive/shared';

describe('Location Geometry & Privacy Obfuscation', () => {
  it('calculates Haversine distance accurately', () => {
    // 1 degree latitude is approximately 111,139 meters
    const dist = haversineDistanceM(37.0, -122.0, 38.0, -122.0);
    expect(dist).toBeGreaterThan(111000);
    expect(dist).toBeLessThan(112000);

    // Same point is 0m
    const zeroDist = haversineDistanceM(37.7749, -122.4194, 37.7749, -122.4194);
    expect(zeroDist).toBe(0);
  });

  it('obfuscates coordinates to grid cell with specified uncertainty', () => {
    const exactLat = 37.7749295;
    const exactLon = -122.4194155;
    const gridM = 60;

    const obfuscated = obfuscateCoordinates(exactLat, exactLon, gridM);

    expect(obfuscated.uncertaintyM).toBe(60);
    // Distance between exact and obfuscated should be within roughly grid size
    const distanceToOriginal = haversineDistanceM(
      exactLat,
      exactLon,
      obfuscated.lat,
      obfuscated.lon
    );
    expect(distanceToOriginal).toBeLessThanOrEqual(gridM * 1.5);
  });
});

describe('Location Ingestion API (Supertest)', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  const runnerUserId = '11111111-1111-1111-1111-111111111111';
  const gameId = '33333333-3333-3333-3333-333333333333';

  it('POST /api/v1/games/:id/location ingests valid location fix batch', async () => {
    const runnerToken = await signAccessToken({ userId: runnerUserId, displayName: 'Runner1' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('SELECT gp.status, gp.role, g.status AS game_status FROM game_players gp')) {
        return {
          rows: [
            {
              status: PlayerStatus.ACTIVE,
              role: PlayerRole.RUNNER,
              game_status: GameStatus.ACTIVE,
            },
          ],
        } as any;
      }
      if (sql.includes('FROM player_latest_locations WHERE game_id = $1 AND user_id = $2')) {
        return { rows: [] } as any; // No previous fix
      }
      return { rows: [] } as any;
    });

    vi.spyOn(poolModule, 'withTransaction').mockImplementation(async (fn: any) => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      return fn(mockClient);
    });

    const res = await request(app)
      .post(`/api/v1/games/${gameId}/location`)
      .set('Authorization', `Bearer ${runnerToken}`)
      .send({
        fixes: [
          {
            lat: 37.7749,
            lon: -122.4194,
            accuracyM: 10,
            clientTs: Date.now(),
            mocked: false,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.recorded).toBe(1);
    expect(res.body.isSuspect).toBe(false);
  });

  it('flags fixes as suspect when speed exceeds 12 m/s', async () => {
    const runnerToken = await signAccessToken({ userId: runnerUserId, displayName: 'Runner1' });
    const prevTime = Date.now() - 5000; // 5 seconds ago

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('SELECT gp.status, gp.role, g.status AS game_status FROM game_players gp')) {
        return {
          rows: [
            {
              status: PlayerStatus.ACTIVE,
              role: PlayerRole.RUNNER,
              game_status: GameStatus.ACTIVE,
            },
          ],
        } as any;
      }
      if (sql.includes('FROM player_latest_locations WHERE game_id = $1 AND user_id = $2')) {
        return {
          rows: [
            {
              lat: 37.7749,
              lon: -122.4194,
              client_ts: new Date(prevTime),
            },
          ],
        } as any;
      }
      return { rows: [] } as any;
    });

    vi.spyOn(poolModule, 'withTransaction').mockImplementation(async (fn: any) => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      return fn(mockClient);
    });

    // Move ~200 meters in 5 seconds = 40 m/s > 12 m/s suspect threshold!
    const res = await request(app)
      .post(`/api/v1/games/${gameId}/location`)
      .set('Authorization', `Bearer ${runnerToken}`)
      .send({
        fixes: [
          {
            lat: 37.7767,
            lon: -122.4194,
            accuracyM: 10,
            clientTs: Date.now(),
            mocked: false,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.isSuspect).toBe(true);
  });
});
