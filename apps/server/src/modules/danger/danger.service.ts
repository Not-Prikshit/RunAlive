// apps/server/src/modules/danger/danger.service.ts
// Danger Meter Engine: distance estimation, EMA smoothing, hysteresis band transitions, and runner alerts

import { DangerBand, type DangerState, SocketEvent } from '@runalive/shared';
import { query } from '../../db/pool.js';
import { emitToUser } from '../../realtime/socket.server.js';
import { haversineDistanceM } from '../locations/locations.service.js';

export const EMA_ALPHA = 0.4;
export const MAX_STALE_FIX_SECONDS = 60;
export const KEEPALIVE_INTERVAL_SECONDS = 30;

export interface GpsFixWithAccuracy {
  lat: number;
  lon: number;
  accuracyM: number;
}

/**
 * Conservative effective distance calculation accounting for GPS accuracy error.
 * rawDistance - 0.5 * (min(runnerAcc, 40) + min(seekerAcc, 40))
 */
export function calculateEffectiveDistance(
  runner: GpsFixWithAccuracy,
  seeker: GpsFixWithAccuracy
): number {
  const rawDist = haversineDistanceM(runner.lat, runner.lon, seeker.lat, seeker.lon);
  const runnerAccCapped = Math.min(Math.max(0, runner.accuracyM), 40);
  const seekerAccCapped = Math.min(Math.max(0, seeker.accuracyM), 40);
  const deduction = 0.5 * (runnerAccCapped + seekerAccCapped);
  return Math.max(0, rawDist - deduction);
}

/**
 * Exponential Moving Average (EMA) distance smoothing:
 * smoothedDistance = alpha * minEffectiveDistance + (1 - alpha) * previousSmoothedDistance
 */
export function calculateEma(
  currentDistance: number,
  previousSmoothedDistance: number | null,
  alpha = EMA_ALPHA
): number {
  if (previousSmoothedDistance === null || !Number.isFinite(previousSmoothedDistance)) {
    return currentDistance;
  }
  return alpha * currentDistance + (1 - alpha) * previousSmoothedDistance;
}

/**
 * Band classification with 20% hysteresis:
 * - Enter more dangerous band immediately
 * - Exit to safer band only when distance > threshold * 1.20
 */
export function computeNextDangerBand(
  currentBand: DangerBand,
  smoothedDistanceM: number | null
): DangerBand {
  if (smoothedDistanceM === null || !Number.isFinite(smoothedDistanceM)) {
    return DangerBand.UNKNOWN;
  }

  const d = smoothedDistanceM;

  // 1. Immediate transitions to higher danger
  if (d < 30) {
    return DangerBand.CRITICAL;
  }
  if (d < 75 && currentBand !== DangerBand.CRITICAL) {
    return DangerBand.HIGH;
  }
  if (d < 150 && currentBand !== DangerBand.CRITICAL && currentBand !== DangerBand.HIGH) {
    return DangerBand.MEDIUM;
  }
  if (
    d < 300 &&
    (currentBand === DangerBand.SAFE || currentBand === DangerBand.UNKNOWN)
  ) {
    return DangerBand.LOW;
  }

  // 2. Hysteresis transitions to safer bands (must exceed threshold by +20%)
  if (currentBand === DangerBand.CRITICAL) {
    if (d < 30 * 1.2) { // 36m
      return DangerBand.CRITICAL;
    }
    if (d < 75) return DangerBand.HIGH;
    if (d < 150) return DangerBand.MEDIUM;
    if (d < 300) return DangerBand.LOW;
    return DangerBand.SAFE;
  }

  if (currentBand === DangerBand.HIGH) {
    if (d < 75 * 1.2) { // 90m
      return DangerBand.HIGH;
    }
    if (d < 150) return DangerBand.MEDIUM;
    if (d < 300) return DangerBand.LOW;
    return DangerBand.SAFE;
  }

  if (currentBand === DangerBand.MEDIUM) {
    if (d < 150 * 1.2) { // 180m
      return DangerBand.MEDIUM;
    }
    if (d < 300) return DangerBand.LOW;
    return DangerBand.SAFE;
  }

  if (currentBand === DangerBand.LOW) {
    if (d < 300 * 1.2) { // 360m
      return DangerBand.LOW;
    }
    return DangerBand.SAFE;
  }

  if (d >= 300) {
    return DangerBand.SAFE;
  }

  return DangerBand.LOW;
}

/**
 * Continuous level indicator from 0 (safe) to 100 (critical danger)
 * clamp(100 - (smoothedDistance / 300 * 100), 0, 100)
 */
export function computeDangerLevel(smoothedDistanceM: number | null): number {
  if (smoothedDistanceM === null || !Number.isFinite(smoothedDistanceM)) {
    return 0;
  }
  const rawLevel = 100 - (smoothedDistanceM / 300) * 100;
  return Math.max(0, Math.min(100, Math.round(rawLevel)));
}

/**
 * Evaluate danger state for a specific active runner in a game.
 */
export async function evaluateRunnerDanger(
  gameId: string,
  runnerUserId: string
): Promise<DangerState> {
  // 1. Fetch runner's latest fix (must not be stale > 60s)
  const { rows: runnerRows } = await query<{
    lat: number;
    lon: number;
    accuracy_m: number;
    received_at: Date;
  }>(
    `SELECT ST_Y(location::geometry) as lat,
            ST_X(location::geometry) as lon,
            accuracy_m,
            received_at
     FROM player_latest_locations
     WHERE game_id = $1 AND user_id = $2
       AND received_at > NOW() - INTERVAL '60 seconds'`,
    [gameId, runnerUserId]
  );

  const runnerFix = runnerRows[0];

  // 2. Fetch all active seekers with fresh fixes (< 60s)
  const { rows: seekerRows } = await query<{
    lat: number;
    lon: number;
    accuracy_m: number;
  }>(
    `SELECT ST_Y(pll.location::geometry) as lat,
            ST_X(pll.location::geometry) as lon,
            pll.accuracy_m
     FROM player_latest_locations pll
     JOIN game_players gp ON gp.game_id = pll.game_id AND gp.user_id = pll.user_id
     WHERE pll.game_id = $1
       AND gp.role = 'SEEKER'
       AND gp.status = 'ACTIVE'
       AND pll.received_at > NOW() - INTERVAL '60 seconds'`,
    [gameId]
  );

  // 3. Fetch previous danger state
  const { rows: prevDangerRows } = await query<{
    band: DangerBand;
    level: number;
    smoothed_distance_m: string | null;
    updated_at: Date;
  }>(
    `SELECT band, level, smoothed_distance_m, updated_at
     FROM danger_state
     WHERE game_id = $1 AND runner_user_id = $2`,
    [gameId, runnerUserId]
  );

  const prevDanger = prevDangerRows[0];
  const prevBand = prevDanger?.band ?? DangerBand.UNKNOWN;
  const prevSmoothedDist = prevDanger?.smoothed_distance_m
    ? parseFloat(prevDanger.smoothed_distance_m)
    : null;

  let newBand: DangerBand = DangerBand.UNKNOWN;
  let newLevel = 0;
  let newSmoothedDist: number | null = null;

  if (runnerFix && seekerRows.length > 0) {
    const runnerCoord: GpsFixWithAccuracy = {
      lat: runnerFix.lat,
      lon: runnerFix.lon,
      accuracyM: Number(runnerFix.accuracy_m),
    };

    // Calculate effective distances to each active seeker
    let minEffectiveDistance = Infinity;
    for (const s of seekerRows) {
      const seekerCoord: GpsFixWithAccuracy = {
        lat: s.lat,
        lon: s.lon,
        accuracyM: Number(s.accuracy_m),
      };
      const effDist = calculateEffectiveDistance(runnerCoord, seekerCoord);
      if (effDist < minEffectiveDistance) {
        minEffectiveDistance = effDist;
      }
    }

    if (Number.isFinite(minEffectiveDistance)) {
      newSmoothedDist = calculateEma(minEffectiveDistance, prevSmoothedDist, EMA_ALPHA);
      newBand = computeNextDangerBand(prevBand, newSmoothedDist);
      newLevel = computeDangerLevel(newSmoothedDist);
    }
  }

  // 4. Upsert danger state
  await query(
    `INSERT INTO danger_state (
       game_id, runner_user_id, band, level, smoothed_distance_m, updated_at
     ) VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (game_id, runner_user_id) DO UPDATE
       SET band = EXCLUDED.band,
           level = EXCLUDED.level,
           smoothed_distance_m = EXCLUDED.smoothed_distance_m,
           updated_at = NOW()`,
    [
      gameId,
      runnerUserId,
      newBand,
      newLevel,
      newSmoothedDist !== null ? Number(newSmoothedDist.toFixed(2)) : null,
    ]
  );

  // 5. Query state_version for socket payload
  const { rows: gameRows } = await query<{ state_version: number }>(
    'SELECT state_version FROM games WHERE id = $1',
    [gameId]
  );
  const stateVersion = gameRows[0]?.state_version ?? 1;

  // Emit to runner: only when band changes, or periodically as keepalive
  const secondsSinceLastUpdate = prevDanger
    ? (Date.now() - new Date(prevDanger.updated_at).getTime()) / 1000
    : Infinity;

  const shouldEmit =
    prevBand !== newBand ||
    secondsSinceLastUpdate >= KEEPALIVE_INTERVAL_SECONDS ||
    Math.abs((prevDanger?.level ?? 0) - newLevel) >= 5;

  if (shouldEmit) {
    emitToUser(runnerUserId, SocketEvent.RUNNER_DANGER, {
      danger: {
        band: newBand,
        level: newLevel,
      },
      stateVersion,
      serverTime: new Date().toISOString(),
    });
  }

  return { band: newBand, level: newLevel };
}

/**
 * Evaluate danger state for all active runners in a game (e.g. after a seeker moves).
 */
export async function evaluateAllRunnersDanger(gameId: string): Promise<void> {
  const { rows: runners } = await query<{ user_id: string }>(
    `SELECT user_id
     FROM game_players
     WHERE game_id = $1 AND role = 'RUNNER' AND status = 'ACTIVE'`,
    [gameId]
  );

  await Promise.allSettled(
    runners.map((r) => evaluateRunnerDanger(gameId, r.user_id))
  );
}
