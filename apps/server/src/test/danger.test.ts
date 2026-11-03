// apps/server/src/test/danger.test.ts
// Unit and integration tests for the Danger Meter Engine

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DangerBand, SocketEvent } from '@runalive/shared';
import {
  calculateEffectiveDistance,
  calculateEma,
  computeNextDangerBand,
  computeDangerLevel,
  evaluateRunnerDanger,
} from '../modules/danger/danger.service.js';
import * as pool from '../db/pool.js';
import * as socketServer from '../realtime/socket.server.js';

describe('Danger Meter — Algorithmic Core', () => {
  describe('calculateEffectiveDistance', () => {
    it('calculates distance and deducts accuracy buffer conservatively', () => {
      // 0,0 to 0,0.001 is ~111.3 meters
      const runner = { lat: 0, lon: 0, accuracyM: 10 };
      const seeker = { lat: 0, lon: 0.001, accuracyM: 10 };

      const dist = calculateEffectiveDistance(runner, seeker);
      // Raw distance ~111.3m, deduction = 0.5 * (10 + 10) = 10m -> ~101.3m
      expect(dist).toBeGreaterThan(95);
      expect(dist).toBeLessThan(105);
    });

    it('caps accuracy deductions at 40m per actor', () => {
      const runner = { lat: 0, lon: 0, accuracyM: 100 }; // capped to 40
      const seeker = { lat: 0, lon: 0.001, accuracyM: 80 }; // capped to 40

      const dist = calculateEffectiveDistance(runner, seeker);
      // Raw distance ~111.3m, deduction = 0.5 * (40 + 40) = 40m -> ~71.3m
      expect(dist).toBeGreaterThan(65);
      expect(dist).toBeLessThan(75);
    });

    it('clamps effective distance to 0 when raw distance is less than accuracy buffer', () => {
      const runner = { lat: 0, lon: 0, accuracyM: 30 };
      const seeker = { lat: 0, lon: 0.0001, accuracyM: 30 }; // ~11m raw distance

      const dist = calculateEffectiveDistance(runner, seeker);
      // Raw distance ~11m, deduction = 30m -> clamped to 0
      expect(dist).toBe(0);
    });
  });

  describe('calculateEma', () => {
    it('uses current distance directly when previous smoothed distance is null', () => {
      expect(calculateEma(120, null)).toBe(120);
    });

    it('applies alpha = 0.4 exponential smoothing to previous distance', () => {
      // 0.4 * 50 + 0.6 * 100 = 20 + 60 = 80
      expect(calculateEma(50, 100)).toBeCloseTo(80, 5);
    });
  });

  describe('computeNextDangerBand with 20% Hysteresis', () => {
    it('immediately escalates into higher danger bands upon approach', () => {
      expect(computeNextDangerBand(DangerBand.SAFE, 20)).toBe(DangerBand.CRITICAL);
      expect(computeNextDangerBand(DangerBand.SAFE, 60)).toBe(DangerBand.HIGH);
      expect(computeNextDangerBand(DangerBand.SAFE, 120)).toBe(DangerBand.MEDIUM);
      expect(computeNextDangerBand(DangerBand.SAFE, 250)).toBe(DangerBand.LOW);
    });

    it('holds CRITICAL band until runner escapes past threshold + 20% (36m)', () => {
      // Threshold 30m; 30 * 1.20 = 36m
      expect(computeNextDangerBand(DangerBand.CRITICAL, 28)).toBe(DangerBand.CRITICAL);
      expect(computeNextDangerBand(DangerBand.CRITICAL, 34)).toBe(DangerBand.CRITICAL); // hysteresis hold
      expect(computeNextDangerBand(DangerBand.CRITICAL, 37)).toBe(DangerBand.HIGH); // escaped to HIGH
    });

    it('holds HIGH band until runner escapes past threshold + 20% (90m)', () => {
      // Threshold 75m; 75 * 1.20 = 90m
      expect(computeNextDangerBand(DangerBand.HIGH, 70)).toBe(DangerBand.HIGH);
      expect(computeNextDangerBand(DangerBand.HIGH, 85)).toBe(DangerBand.HIGH); // hysteresis hold
      expect(computeNextDangerBand(DangerBand.HIGH, 95)).toBe(DangerBand.MEDIUM); // escaped to MEDIUM
    });

    it('holds MEDIUM band until runner escapes past threshold + 20% (180m)', () => {
      // Threshold 150m; 150 * 1.20 = 180m
      expect(computeNextDangerBand(DangerBand.MEDIUM, 140)).toBe(DangerBand.MEDIUM);
      expect(computeNextDangerBand(DangerBand.MEDIUM, 170)).toBe(DangerBand.MEDIUM); // hysteresis hold
      expect(computeNextDangerBand(DangerBand.MEDIUM, 185)).toBe(DangerBand.LOW); // escaped to LOW
    });

    it('holds LOW band until runner escapes past threshold + 20% (360m)', () => {
      // Threshold 300m; 300 * 1.20 = 360m
      expect(computeNextDangerBand(DangerBand.LOW, 280)).toBe(DangerBand.LOW);
      expect(computeNextDangerBand(DangerBand.LOW, 340)).toBe(DangerBand.LOW); // hysteresis hold
      expect(computeNextDangerBand(DangerBand.LOW, 365)).toBe(DangerBand.SAFE); // escaped to SAFE
    });

    it('returns UNKNOWN if smoothed distance is null or invalid', () => {
      expect(computeNextDangerBand(DangerBand.HIGH, null)).toBe(DangerBand.UNKNOWN);
      expect(computeNextDangerBand(DangerBand.HIGH, NaN)).toBe(DangerBand.UNKNOWN);
    });
  });

  describe('computeDangerLevel', () => {
    it('maps distance smoothly to 0-100 range', () => {
      expect(computeDangerLevel(0)).toBe(100);
      expect(computeDangerLevel(150)).toBe(50);
      expect(computeDangerLevel(300)).toBe(0);
      expect(computeDangerLevel(400)).toBe(0); // clamped at 0
      expect(computeDangerLevel(null)).toBe(0);
    });
  });
});

describe('Danger Meter — DB & Socket Integration', () => {
  const gameId = '11111111-1111-1111-1111-111111111111';
  const runnerId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sets band to UNKNOWN when no active seekers have fresh fixes', async () => {
    const querySpy = vi.spyOn(pool, 'query').mockImplementation((sql: string) => {
      if (sql.includes('SELECT ST_Y(location::geometry) as lat') && sql.includes('runner_user_id')) {
        // Runner fix found
        return Promise.resolve({
          rows: [{ lat: 37.7749, lon: -122.4194, accuracy_m: 10, received_at: new Date() }],
        } as any);
      }
      if (sql.includes("gp.role = 'SEEKER'")) {
        // No fresh seeker fixes
        return Promise.resolve({ rows: [] } as any);
      }
      if (sql.includes('FROM danger_state')) {
        return Promise.resolve({ rows: [] } as any);
      }
      if (sql.includes('INSERT INTO danger_state')) {
        return Promise.resolve({ rows: [] } as any);
      }
      if (sql.includes('SELECT state_version FROM games')) {
        return Promise.resolve({ rows: [{ state_version: 3 }] } as any);
      }
      return Promise.resolve({ rows: [] } as any);
    });

    const emitSpy = vi.spyOn(socketServer, 'emitToUser').mockImplementation(() => {});

    const result = await evaluateRunnerDanger(gameId, runnerId);

    expect(result.band).toBe(DangerBand.UNKNOWN);
    expect(result.level).toBe(0);
    expect(emitSpy).toHaveBeenCalledWith(
      runnerId,
      SocketEvent.RUNNER_DANGER,
      expect.objectContaining({
        danger: { band: DangerBand.UNKNOWN, level: 0 },
        stateVersion: 3,
      })
    );
  });

  it('computes CRITICAL danger and emits to runner when seeker is within 25m', async () => {
    vi.spyOn(pool, 'query').mockImplementation((sql: string) => {
      if (sql.includes('WHERE game_id = $1 AND user_id = $2') && sql.includes('received_at > NOW()')) {
        // Runner at 37.7749, -122.4194
        return Promise.resolve({
          rows: [{ lat: 37.7749, lon: -122.4194, accuracy_m: 5, received_at: new Date() }],
        } as any);
      }
      if (sql.includes("gp.role = 'SEEKER'")) {
        // Seeker very close: ~20m away (lat offset 0.00018 is ~20m)
        return Promise.resolve({
          rows: [{ lat: 37.77508, lon: -122.4194, accuracy_m: 5 }],
        } as any);
      }
      if (sql.includes('FROM danger_state')) {
        return Promise.resolve({
          rows: [{ band: DangerBand.HIGH, level: 75, smoothed_distance_m: '28.0', updated_at: new Date() }],
        } as any);
      }
      if (sql.includes('INSERT INTO danger_state')) {
        return Promise.resolve({ rows: [] } as any);
      }
      if (sql.includes('SELECT state_version FROM games')) {
        return Promise.resolve({ rows: [{ state_version: 5 }] } as any);
      }
      return Promise.resolve({ rows: [] } as any);
    });

    const emitSpy = vi.spyOn(socketServer, 'emitToUser').mockImplementation(() => {});

    const result = await evaluateRunnerDanger(gameId, runnerId);

    expect(result.band).toBe(DangerBand.CRITICAL);
    expect(result.level).toBeGreaterThan(80);
    expect(emitSpy).toHaveBeenCalledWith(
      runnerId,
      SocketEvent.RUNNER_DANGER,
      expect.objectContaining({
        danger: { band: DangerBand.CRITICAL, level: expect.any(Number) },
      })
    );
  });
});
