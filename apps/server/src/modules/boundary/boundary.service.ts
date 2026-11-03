// apps/server/src/modules/boundary/boundary.service.ts
// Boundary Enforcement: PostGIS/Haversine distance checking, conclusive fix rules, grace period lifecycle

import {
  SocketEvent,
  GameStatus,
  PlayerRole,
  PlayerStatus,
  JobType,
  GameWinner,
} from '@runalive/shared';
import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../app.js';
import { haversineDistanceM } from '../locations/locations.service.js';
import { emitToGame, emitToUser } from '../../realtime/socket.server.js';
import { scheduleJob, registerJobHandler } from '../../scheduler/scheduler.service.js';
import { endGame } from '../games/engine.service.js';

const CONCLUSIVE_FIX_ACCURACY_THRESHOLD_M = 50.0; // Rule: Only fixes with accuracy <= 50m change violation status

/**
 * Evaluates a player's newest location fix against the active round boundary.
 */
export async function checkPlayerBoundary(
  userId: string,
  gameId: string,
  fix: { lat: number; lon: number; accuracyM: number }
): Promise<void> {
  // Only conclusive fixes evaluate boundary violations
  if (fix.accuracyM > CONCLUSIVE_FIX_ACCURACY_THRESHOLD_M) {
    return;
  }

  // Get active game and current round perimeter
  const { rows: gameRows } = await query<{
    status: GameStatus;
    current_round: number;
    violation_grace_seconds: number;
    center_lat: number;
    center_lon: number;
    radius_m: number;
  }>(
    `SELECT g.status, g.current_round, g.violation_grace_seconds,
            gr.center_lat, gr.center_lon, gr.radius_m
     FROM games g
     JOIN game_rounds gr ON gr.game_id = g.id AND gr.round_number = g.current_round
     WHERE g.id = $1`,
    [gameId]
  );

  const game = gameRows[0];
  if (!game || game.status !== GameStatus.ACTIVE) return;

  // Check player role and status — boundary violations apply to RUNNERS
  const { rows: playerRows } = await query<{
    role: PlayerRole;
    status: PlayerStatus;
    display_name: string;
  }>(
    `SELECT gp.role, gp.status, u.display_name
     FROM game_players gp
     JOIN users u ON u.id = gp.user_id
     WHERE gp.game_id = $1 AND gp.user_id = $2`,
    [gameId, userId]
  );

  const player = playerRows[0];
  if (!player || player.role !== PlayerRole.RUNNER || player.status !== PlayerStatus.ACTIVE) {
    return;
  }

  const distanceToCenterM = haversineDistanceM(
    fix.lat,
    fix.lon,
    Number(game.center_lat),
    Number(game.center_lon)
  );

  const isOutside = distanceToCenterM > Number(game.radius_m);

  // Check if open violation already exists
  const { rows: violationRows } = await query<{
    id: string;
    started_at: Date;
    deadline_at: Date;
  }>(
    `SELECT id, started_at, deadline_at
     FROM boundary_violations
     WHERE game_id = $1 AND player_user_id = $2 AND status = 'OPEN'`,
    [gameId, userId]
  );

  const activeViolation = violationRows[0];

  if (isOutside) {
    if (!activeViolation) {
      // Player just crossed outside the boundary!
      const now = new Date();
      const deadlineAt = new Date(now.getTime() + game.violation_grace_seconds * 1000);

      const { rows: newVioRows } = await query<{ id: string }>(
        `INSERT INTO boundary_violations (game_id, player_user_id, status, started_at, deadline_at)
         VALUES ($1, $2, 'OPEN', $3, $4)
         RETURNING id`,
        [gameId, userId, now, deadlineAt]
      );

      const violationId = newVioRows[0]!.id;

      // Schedule deadline check job
      await scheduleJob(JobType.VIOLATION_DEADLINE, deadlineAt, {
        gameId,
        payload: { violationId, userId },
        dedupeKey: `violation:${violationId}`,
      });

      // Notify player
      emitToUser(userId, SocketEvent.VIOLATION_STARTED, {
        id: violationId,
        deadlineAt: deadlineAt.toISOString(),
        startedAt: now.toISOString(),
      });

      // Alert host
      emitToGame(gameId, SocketEvent.HOST_ALERT, {
        type: 'BOUNDARY_VIOLATION_START',
        userId,
        playerName: player.display_name,
        deadlineAt: deadlineAt.toISOString(),
      });
    }
  } else {
    // Player is inside the perimeter
    if (activeViolation) {
      // Player safely returned!
      const now = new Date();

      await query(
        `UPDATE boundary_violations
         SET status = 'CLEARED', resolved_at = $1
         WHERE id = $2`,
        [now, activeViolation.id]
      );

      emitToUser(userId, SocketEvent.VIOLATION_CLEARED, {
        violationId: activeViolation.id,
        clearedAt: now.toISOString(),
      });

      emitToGame(gameId, SocketEvent.HOST_ALERT, {
        type: 'BOUNDARY_VIOLATION_CLEARED',
        userId,
        playerName: player.display_name,
      });
    }
  }
}

/**
 * Handle VIOLATION_DEADLINE scheduled job: disqualifies runner if still outside boundary.
 */
export async function handleViolationDeadline(violationId: string): Promise<void> {
  const { rows: vioRows } = await query<{
    id: string;
    game_id: string;
    player_user_id: string;
    status: string;
  }>(
    'SELECT id, game_id, player_user_id, status FROM boundary_violations WHERE id = $1',
    [violationId]
  );

  const violation = vioRows[0];
  if (!violation || violation.status !== 'OPEN') return;

  const now = new Date();

  await withTransaction(async (client) => {
    // Mark violation as DISQUALIFIED
    await client.query(
      `UPDATE boundary_violations
       SET status = 'DISQUALIFIED', resolved_at = $1
       WHERE id = $2`,
      [now, violationId]
    );

    // Disqualify player in game_players
    await client.query(
      `UPDATE game_players
       SET status = 'DISQUALIFIED',
           disqualification_reason = 'BOUNDARY',
           eliminated_at = $1
       WHERE game_id = $2 AND user_id = $3`,
      [now, violation.game_id, violation.player_user_id]
    );
  });

  // Emit elimination to game
  emitToGame(violation.game_id, SocketEvent.PLAYER_ELIMINATED, {
    userId: violation.player_user_id,
    reason: 'BOUNDARY_DISQUALIFICATION',
    eliminatedAt: now.toISOString(),
  });

  // Check win condition: if 0 active runners left, Seekers win!
  const { rows: remaining } = await query<{ count: string }>(
    `SELECT count(*) FROM game_players
     WHERE game_id = $1 AND role = 'RUNNER' AND status = 'ACTIVE'`,
    [violation.game_id]
  );

  if (parseInt(remaining[0]?.count ?? '0', 10) === 0) {
    await endGame(violation.game_id, GameWinner.SEEKERS, 'All runners eliminated');
  }
}

/**
 * Host reverses a disqualification (mistake, referee discretion).
 */
export async function reverseDisqualification(
  hostUserId: string,
  gameId: string,
  violationId: string
): Promise<void> {
  const { rows: gameRows } = await query<{ host_user_id: string }>(
    'SELECT host_user_id FROM games WHERE id = $1',
    [gameId]
  );

  if (!gameRows[0] || gameRows[0].host_user_id !== hostUserId) {
    throw new AppError('FORBIDDEN', 'Only host can reverse disqualifications', 403);
  }

  const { rows: vioRows } = await query<{
    id: string;
    player_user_id: string;
    status: string;
  }>(
    'SELECT id, player_user_id, status FROM boundary_violations WHERE id = $1 AND game_id = $2',
    [violationId, gameId]
  );

  const violation = vioRows[0];
  if (!violation) {
    throw new AppError('NOT_FOUND', 'Violation not found', 404);
  }

  const now = new Date();

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE boundary_violations
       SET status = 'REVERSED', reversal_by = $1, resolved_at = $2
       WHERE id = $3`,
      [hostUserId, now, violationId]
    );

    // Restore player status to ACTIVE
    await client.query(
      `UPDATE game_players
       SET status = 'ACTIVE', disqualification_reason = NULL, eliminated_at = NULL
       WHERE game_id = $1 AND user_id = $2`,
      [gameId, violation.player_user_id]
    );
  });

  emitToGame(gameId, SocketEvent.HOST_ALERT, {
    type: 'DISQUALIFICATION_REVERSED',
    userId: violation.player_user_id,
    violationId,
  });
}

/**
 * Fetch all disqualifications for a game.
 */
export async function getGameDisqualifications(gameId: string): Promise<any[]> {
  const { rows } = await query(
    `SELECT bv.id, bv.player_user_id, u.display_name, bv.status,
            bv.started_at, bv.deadline_at, bv.resolved_at
     FROM boundary_violations bv
     JOIN users u ON u.id = bv.player_user_id
     WHERE bv.game_id = $1
     ORDER BY bv.started_at DESC`,
    [gameId]
  );

  return rows;
}

// ── Register VIOLATION_DEADLINE handler ───────────────────────────────────────
registerJobHandler(JobType.VIOLATION_DEADLINE, async (job) => {
  const violationId = (job.payload as { violationId?: string })?.violationId;
  if (violationId) {
    await handleViolationDeadline(violationId);
  }
});
