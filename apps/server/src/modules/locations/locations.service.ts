// apps/server/src/modules/locations/locations.service.ts
// Location Ingestion Pipeline: speed plausibility, latest fix upsert, grid obfuscation for seekers

import crypto from 'node:crypto';
import {
  type LocationBatch,
  type RunnerSnapshot,
  PlayerRole,
  PlayerStatus,
  GameStatus,
  JobType,
} from '@runalive/shared';
import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../app.js';
import { emitToSeekers, emitToGame } from '../../realtime/socket.server.js';
import { scheduleJob, registerJobHandler } from '../../scheduler/scheduler.service.js';
import { checkPlayerBoundary } from '../boundary/boundary.service.js';
import { evaluateRunnerDanger, evaluateAllRunnersDanger } from '../danger/danger.service.js';

const SUSPECT_SPEED_THRESHOLD_MPS = 12.0; // ~43 km/h suspect threshold for campus foot chase

/**
 * Standard Haversine distance in meters between two lat/lon coordinates.
 */
export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Deterministic spatial grid snapping and jitter for seeker privacy protection.
 * Seekers NEVER receive exact runner coordinates.
 */
export function obfuscateCoordinates(
  lat: number,
  lon: number,
  gridM: number
): { lat: number; lon: number; uncertaintyM: number } {
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);

  // Grid cell dimensions in degrees
  const cellDegLat = gridM / mPerDegLat;
  const cellDegLon = gridM / Math.max(mPerDegLon, 1);

  // Snap to center of grid cell
  const snappedLat = Math.round(lat / cellDegLat) * cellDegLat;
  const snappedLon = Math.round(lon / cellDegLon) * cellDegLon;

  // Add pseudorandom deterministic jitter within 25% of grid cell
  const hash = crypto
    .createHash('md5')
    .update(`${snappedLat.toFixed(5)}:${snappedLon.toFixed(5)}`)
    .digest('hex');

  const jitterRatioLat = ((parseInt(hash.slice(0, 4), 16) % 1000) / 1000 - 0.5) * 0.5;
  const jitterRatioLon = ((parseInt(hash.slice(4, 8), 16) % 1000) / 1000 - 0.5) * 0.5;

  const approxLat = snappedLat + jitterRatioLat * cellDegLat;
  const approxLon = snappedLon + jitterRatioLon * cellDegLon;

  return {
    lat: Number(approxLat.toFixed(7)),
    lon: Number(approxLon.toFixed(7)),
    uncertaintyM: gridM,
  };
}

/**
 * Ingest a batch of client location fixes from mobile foreground/background task.
 */
export async function recordLocationBatch(
  userId: string,
  gameId: string,
  batch: LocationBatch
): Promise<{ recorded: number; isSuspect: boolean }> {
  if (batch.fixes.length === 0) {
    return { recorded: 0, isSuspect: false };
  }

  // Sort fixes ascending by client timestamp
  const sortedFixes = [...batch.fixes].sort((a, b) => a.clientTs - b.clientTs);
  const newestFix = sortedFixes[sortedFixes.length - 1]!;

  // Verify game is ACTIVE and player is participating
  const { rows: playerRows } = await query<{
    status: PlayerStatus;
    role: PlayerRole;
    game_status: GameStatus;
  }>(
    `SELECT gp.status, gp.role, g.status AS game_status
     FROM game_players gp
     JOIN games g ON g.id = gp.game_id
     WHERE gp.game_id = $1 AND gp.user_id = $2`,
    [gameId, userId]
  );

  const player = playerRows[0];
  if (!player || player.status !== PlayerStatus.ACTIVE || player.game_status !== GameStatus.ACTIVE) {
    // Ignore updates from inactive players or games
    return { recorded: 0, isSuspect: false };
  }

  // Check previous fix for speed plausibility
  const { rows: prevRows } = await query<{
    lat: number;
    lon: number;
    client_ts: Date;
  }>(
    `SELECT ST_Y(location::geometry) as lat,
            ST_X(location::geometry) as lon,
            client_ts
     FROM player_latest_locations
     WHERE game_id = $1 AND user_id = $2`,
    [gameId, userId]
  );

  let isSuspect = false;
  const prevFix = prevRows[0];
  if (prevFix) {
    const deltaSeconds = (newestFix.clientTs - new Date(prevFix.client_ts).getTime()) / 1000;
    if (deltaSeconds > 0 && deltaSeconds < 60) {
      const distanceM = haversineDistanceM(prevFix.lat, prevFix.lon, newestFix.lat, newestFix.lon);
      const speedMps = distanceM / deltaSeconds;
      if (speedMps > SUSPECT_SPEED_THRESHOLD_MPS) {
        isSuspect = true;
      }
    }
  }

  // Upsert latest location
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO player_latest_locations (
        game_id, user_id, location, accuracy_m, client_ts, is_mocked, is_suspect, received_at
      ) VALUES (
        $1, $2,
        ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
        $5, to_timestamp($6 / 1000.0), $7, $8, NOW()
      )
      ON CONFLICT (game_id, user_id) DO UPDATE
        SET location = EXCLUDED.location,
            accuracy_m = EXCLUDED.accuracy_m,
            client_ts = EXCLUDED.client_ts,
            is_mocked = EXCLUDED.is_mocked,
            is_suspect = EXCLUDED.is_suspect,
            received_at = NOW()`,
      [
        gameId,
        userId,
        newestFix.lat,
        newestFix.lon,
        newestFix.accuracyM,
        newestFix.clientTs,
        newestFix.mocked ?? false,
        isSuspect,
      ]
    );

    // Keep player connection / last_seen alive
    await client.query(
      `UPDATE game_players
       SET last_seen_at = NOW(), connected = true
       WHERE game_id = $1 AND user_id = $2`,
      [gameId, userId]
    );
  });

  // Evaluate boundary compliance asynchronously
  void checkPlayerBoundary(userId, gameId, newestFix).catch(() => {});

  // Evaluate danger meter asynchronously
  if (player.role === PlayerRole.RUNNER) {
    void evaluateRunnerDanger(gameId, userId).catch(() => {});
  } else if (player.role === PlayerRole.SEEKER) {
    void evaluateAllRunnersDanger(gameId).catch(() => {});
  }

  return { recorded: sortedFixes.length, isSuspect };
}

/**
 * Generate and broadcast obfuscated runner snapshots to Seekers on SHARE_TICK.
 */
export async function broadcastRunnerSnapshots(gameId: string): Promise<void> {
  const { rows: gameRows } = await query<{
    status: GameStatus;
    obfuscation_grid_m: number;
    runner_share_interval_seconds: number;
  }>(
    'SELECT status, obfuscation_grid_m, runner_share_interval_seconds FROM games WHERE id = $1',
    [gameId]
  );

  const game = gameRows[0];
  if (!game || game.status !== GameStatus.ACTIVE) return;

  const gridM = game.obfuscation_grid_m;

  const { rows: runnerRows } = await query<{
    user_id: string;
    display_name: string;
    lat: number | null;
    lon: number | null;
    accuracy_m: number | null;
    client_ts: Date | null;
  }>(
    `SELECT gp.user_id, u.display_name,
            ST_Y(pll.location::geometry) as lat,
            ST_X(pll.location::geometry) as lon,
            pll.accuracy_m,
            pll.client_ts
     FROM game_players gp
     JOIN users u ON u.id = gp.user_id
     LEFT JOIN player_latest_locations pll
       ON pll.game_id = gp.game_id AND pll.user_id = gp.user_id
     WHERE gp.game_id = $1
       AND gp.role = 'RUNNER'
       AND gp.status = 'ACTIVE'`,
    [gameId]
  );

  const now = Date.now();
  const snapshots: RunnerSnapshot[] = [];

  for (const runner of runnerRows) {
    if (runner.lat !== null && runner.lon !== null && runner.client_ts !== null) {
      const fixAgeSec = (now - new Date(runner.client_ts).getTime()) / 1000;

      if (fixAgeSec <= 90) {
        // Obfuscate coordinates
        const approx = obfuscateCoordinates(Number(runner.lat), Number(runner.lon), gridM);

        // Store snapshot in DB
        await query(
          `INSERT INTO runner_snapshots (game_id, runner_user_id, approx_location, uncertainty_m, captured_at)
           VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5, $6)
           ON CONFLICT (game_id, runner_user_id) DO UPDATE
             SET approx_location = EXCLUDED.approx_location,
                 uncertainty_m = EXCLUDED.uncertainty_m,
                 captured_at = EXCLUDED.captured_at`,
          [
            gameId,
            runner.user_id,
            approx.lat,
            approx.lon,
            approx.uncertaintyM,
            runner.client_ts,
          ]
        );

        snapshots.push({
          userId: runner.user_id,
          displayName: runner.display_name,
          isFresh: true,
          location: {
            lat: approx.lat,
            lon: approx.lon,
            uncertaintyM: approx.uncertaintyM,
            capturedAt: runner.client_ts.toISOString(),
            freshnessSeconds: Math.round(fixAgeSec),
          },
        });
        continue;
      }
    }

    // Runner location stale or unavailable
    snapshots.push({
      userId: runner.user_id,
      displayName: runner.display_name,
      isFresh: false,
      location: null,
    });
  }

  // Broadcast to Seekers only
  emitToSeekers(gameId, 'seekers:snapshot', { snapshots, serverTime: new Date().toISOString() });

  // Schedule next SHARE_TICK
  const nextShareAt = new Date(Date.now() + game.runner_share_interval_seconds * 1000);
  await scheduleJob(JobType.SHARE_TICK, nextShareAt, {
    gameId,
    dedupeKey: `share_tick:${gameId}`,
  });
}

// ── Register SHARE_TICK handler ───────────────────────────────────────────────
registerJobHandler(JobType.SHARE_TICK, async (job) => {
  if (job.game_id) {
    await broadcastRunnerSnapshots(job.game_id);
  }
});
