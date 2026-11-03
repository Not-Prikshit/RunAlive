// apps/server/src/modules/catches/catches.service.ts
// Catch Verification Engine: reports, idempotency, role-based confirmation, dispute handling, win checks

import {
  type CatchReportPublic,
  CatchReportStatus,
  CatchVerificationMode,
  PlayerRole,
  PlayerStatus,
  GameStatus,
  GameWinner,
  SocketEvent,
} from '@runalive/shared';
import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../app.js';
import { emitToGame, emitToUser } from '../../realtime/socket.server.js';
import { endGame } from '../games/engine.service.js';

export interface CatchReportRecord {
  id: string;
  gameId: string;
  seekerUserId: string;
  runnerUserId: string;
  idempotencyKey: string;
  status: CatchReportStatus;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  rejectReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Convert DB row to public representation.
 */
function toCatchReportPublic(row: {
  id: string;
  runner_user_id: string;
  seeker_user_id: string;
  status: CatchReportStatus;
  created_at: Date;
}): CatchReportPublic {
  return {
    id: row.id,
    runnerId: row.runner_user_id,
    seekerId: row.seeker_user_id,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Submit a catch report (Seeker action).
 * Must be an active seeker reporting an active runner in an active match.
 * Idempotent by idempotencyKey.
 */
export async function submitCatch(
  seekerUserId: string,
  gameId: string,
  input: { runnerId: string; idempotencyKey: string }
): Promise<CatchReportPublic> {
  const { runnerId, idempotencyKey } = input;

  // 1. Check idempotency first
  const { rows: existingKeyRows } = await query<{
    id: string;
    runner_user_id: string;
    seeker_user_id: string;
    status: CatchReportStatus;
    created_at: Date;
  }>(
    `SELECT id, runner_user_id, seeker_user_id, status, created_at
     FROM catch_reports
     WHERE idempotency_key = $1`,
    [idempotencyKey]
  );

  if (existingKeyRows[0]) {
    return toCatchReportPublic(existingKeyRows[0]);
  }

  // 2. Validate game status
  const { rows: gameRows } = await query<{
    status: GameStatus;
    host_user_id: string;
    state_version: number;
  }>('SELECT status, host_user_id, state_version FROM games WHERE id = $1', [gameId]);

  const game = gameRows[0];
  if (!game) {
    throw new AppError('GAME_NOT_FOUND', 'Game not found', 404);
  }
  if (game.status === GameStatus.PAUSED) {
    throw new AppError('GAME_PAUSED', 'Cannot report catch while game is paused', 400);
  }
  if (game.status !== GameStatus.ACTIVE) {
    throw new AppError('INVALID_STATE', 'Game is not active', 400);
  }

  // 3. Validate seeker role & status
  const { rows: seekerRows } = await query<{ role: PlayerRole; status: PlayerStatus }>(
    `SELECT role, status FROM game_players
     WHERE game_id = $1 AND user_id = $2`,
    [gameId, seekerUserId]
  );
  const seeker = seekerRows[0];
  if (!seeker || seeker.role !== PlayerRole.SEEKER || seeker.status !== PlayerStatus.ACTIVE) {
    throw new AppError('FORBIDDEN', 'Only active seekers can report catches', 403);
  }

  // 4. Validate runner role & status
  const { rows: runnerRows } = await query<{ role: PlayerRole; status: PlayerStatus; display_name: string }>(
    `SELECT gp.role, gp.status, u.display_name
     FROM game_players gp
     JOIN users u ON u.id = gp.user_id
     WHERE gp.game_id = $1 AND gp.user_id = $2`,
    [gameId, runnerId]
  );
  const runner = runnerRows[0];
  if (!runner || runner.role !== PlayerRole.RUNNER) {
    throw new AppError('RUNNER_NOT_FOUND', 'Target player is not a runner in this game', 404);
  }
  if (runner.status !== PlayerStatus.ACTIVE) {
    throw new AppError('RUNNER_NOT_ACTIVE', 'Runner is already caught or disqualified', 400);
  }

  // 5. Check if runner already has a pending catch report
  const { rows: pendingRows } = await query<{ id: string }>(
    `SELECT id FROM catch_reports
     WHERE game_id = $1 AND runner_user_id = $2 AND status = 'PENDING'`,
    [gameId, runnerId]
  );
  if (pendingRows.length > 0) {
    throw new AppError('CATCH_ALREADY_PENDING', 'A catch report for this runner is already pending verification', 409);
  }

  // 6. Insert pending catch report
  const { rows: inserted } = await query<{
    id: string;
    runner_user_id: string;
    seeker_user_id: string;
    status: CatchReportStatus;
    created_at: Date;
  }>(
    `INSERT INTO catch_reports (game_id, seeker_user_id, runner_user_id, idempotency_key, status)
     VALUES ($1, $2, $3, $4, 'PENDING')
     RETURNING id, runner_user_id, seeker_user_id, status, created_at`,
    [gameId, seekerUserId, runnerId, idempotencyKey]
  );

  const report = toCatchReportPublic(inserted[0]!);

  const socketPayload = {
    report,
    stateVersion: game.state_version,
    serverTime: new Date().toISOString(),
  };

  // Notify runner, seeker, and host
  emitToUser(runnerId, SocketEvent.CATCH_PENDING, socketPayload);
  emitToUser(seekerUserId, SocketEvent.CATCH_PENDING, socketPayload);
  emitToUser(game.host_user_id, SocketEvent.CATCH_PENDING, socketPayload);

  return report;
}

/**
 * Confirm a pending catch report.
 * Actor must be allowed per game's catchVerificationMode:
 * - RUNNER_OR_HOST: Runner (self) or Host
 * - HOST_ONLY: Host only
 * - RUNNER_ONLY: Runner only
 */
export async function confirmCatch(
  actorUserId: string,
  gameId: string,
  catchId: string
): Promise<CatchReportPublic> {
  let updatedReport: CatchReportPublic | null = null;
  let remainingRunnersCount = 0;
  let totalRunnersCount = 0;
  let runnerDisplayName = '';
  let runnerUserId = '';
  let stateVersion = 1;

  await withTransaction(async (client) => {
    // 1. Fetch catch report FOR UPDATE
    const { rows: catchRows } = await client.query<{
      id: string;
      runner_user_id: string;
      seeker_user_id: string;
      status: CatchReportStatus;
      created_at: Date;
    }>(
      `SELECT id, runner_user_id, seeker_user_id, status, created_at
       FROM catch_reports
       WHERE id = $1 AND game_id = $2
       FOR UPDATE`,
      [catchId, gameId]
    );

    const reportRow = catchRows[0];
    if (!reportRow) {
      throw new AppError('CATCH_NOT_FOUND', 'Catch report not found', 404);
    }

    runnerUserId = reportRow.runner_user_id;

    // Idempotent: if already confirmed, return it
    if (reportRow.status === CatchReportStatus.CONFIRMED) {
      updatedReport = toCatchReportPublic(reportRow);
      return;
    }

    if (reportRow.status !== CatchReportStatus.PENDING && reportRow.status !== CatchReportStatus.DISPUTED) {
      throw new AppError('INVALID_STATE', `Cannot confirm catch in ${reportRow.status} status`, 400);
    }

    // 2. Fetch game rules and verification mode
    const { rows: gameRows } = await client.query<{
      host_user_id: string;
      catch_verification_mode: CatchVerificationMode;
      state_version: number;
    }>(
      `SELECT host_user_id, catch_verification_mode, state_version
       FROM games
       WHERE id = $1`,
      [gameId]
    );

    const game = gameRows[0];
    if (!game) {
      throw new AppError('GAME_NOT_FOUND', 'Game not found', 404);
    }

    // Check verification authorization
    const isRunner = actorUserId === reportRow.runner_user_id;
    const isHost = actorUserId === game.host_user_id;

    if (game.catch_verification_mode === CatchVerificationMode.RUNNER_ONLY && !isRunner) {
      throw new AppError('FORBIDDEN', 'Only the caught runner can confirm this catch', 403);
    }
    if (game.catch_verification_mode === CatchVerificationMode.HOST_ONLY && !isHost) {
      throw new AppError('FORBIDDEN', 'Only the match host can confirm this catch', 403);
    }
    if (game.catch_verification_mode === CatchVerificationMode.RUNNER_OR_HOST && !isRunner && !isHost) {
      throw new AppError('FORBIDDEN', 'Only the runner or match host can confirm this catch', 403);
    }

    // 3. Mark catch report CONFIRMED
    const { rows: updatedRows } = await client.query<{
      id: string;
      runner_user_id: string;
      seeker_user_id: string;
      status: CatchReportStatus;
      created_at: Date;
    }>(
      `UPDATE catch_reports
       SET status = 'CONFIRMED',
           verified_by = $1,
           verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, runner_user_id, seeker_user_id, status, created_at`,
      [actorUserId, catchId]
    );

    updatedReport = toCatchReportPublic(updatedRows[0]!);

    // 4. Mark runner as CAUGHT in game_players
    await client.query(
      `UPDATE game_players
       SET status = 'CAUGHT'
       WHERE game_id = $1 AND user_id = $2`,
      [gameId, runnerUserId]
    );

    // 5. Fetch runner display name for notifications
    const { rows: userRows } = await client.query<{ display_name: string }>(
      'SELECT display_name FROM users WHERE id = $1',
      [runnerUserId]
    );
    runnerDisplayName = userRows[0]?.display_name ?? 'Runner';

    // 6. Record audit event
    await client.query(
      `INSERT INTO game_events (game_id, event_type, payload)
       VALUES ($1, 'PLAYER_CAUGHT', $2::jsonb)`,
      [
        gameId,
        JSON.stringify({
          catchId,
          runnerUserId,
          seekerUserId: reportRow.seeker_user_id,
          verifiedBy: actorUserId,
        }),
      ]
    );

    // 7. Increment state version
    const { rows: versionRows } = await client.query<{ state_version: number }>(
      `UPDATE games
       SET state_version = state_version + 1
       WHERE id = $1
       RETURNING state_version`,
      [gameId]
    );
    stateVersion = versionRows[0]?.state_version ?? (game.state_version + 1);

    // 8. Count remaining active runners
    const { rows: countRows } = await client.query<{
      remaining: string;
      total: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'ACTIVE') AS remaining,
         COUNT(*) AS total
       FROM game_players
       WHERE game_id = $1 AND role = 'RUNNER' AND status NOT IN ('LEFT', 'KICKED')`,
      [gameId]
    );

    remainingRunnersCount = parseInt(countRows[0]?.remaining ?? '0', 10);
    totalRunnersCount = parseInt(countRows[0]?.total ?? '0', 10);
  });

  const nowIso = new Date().toISOString();

  // Socket broadcasts
  emitToGame(gameId, SocketEvent.CATCH_RESOLVED, {
    report: updatedReport!,
    stateVersion,
    serverTime: nowIso,
  });

  emitToGame(gameId, SocketEvent.PLAYER_ELIMINATED, {
    userId: runnerUserId,
    displayName: runnerDisplayName,
    status: PlayerStatus.CAUGHT,
    reason: 'Caught by seeker',
    runnersLeft: remainingRunnersCount,
    stateVersion,
    serverTime: nowIso,
  });

  emitToGame(gameId, SocketEvent.PLAYERS_COUNT, {
    runnersLeft: remainingRunnersCount,
    totalRunners: totalRunnersCount,
    stateVersion,
    serverTime: nowIso,
  });

  // WIN CONDITION: If no runners remain active, Seekers win!
  if (remainingRunnersCount === 0) {
    await endGame(gameId, GameWinner.SEEKERS, 'All runners have been caught');
  }

  return updatedReport!;
}

/**
 * Reject a pending catch report.
 * Actor must be the runner (self) or host.
 */
export async function rejectCatch(
  actorUserId: string,
  gameId: string,
  catchId: string,
  reason?: string
): Promise<CatchReportPublic> {
  const { rows: catchRows } = await query<{
    id: string;
    runner_user_id: string;
    seeker_user_id: string;
    status: CatchReportStatus;
    created_at: Date;
  }>(
    `SELECT id, runner_user_id, seeker_user_id, status, created_at
     FROM catch_reports
     WHERE id = $1 AND game_id = $2`,
    [catchId, gameId]
  );

  const reportRow = catchRows[0];
  if (!reportRow) {
    throw new AppError('CATCH_NOT_FOUND', 'Catch report not found', 404);
  }

  const { rows: gameRows } = await query<{ host_user_id: string; state_version: number }>(
    'SELECT host_user_id, state_version FROM games WHERE id = $1',
    [gameId]
  );
  const game = gameRows[0];
  if (!game) {
    throw new AppError('GAME_NOT_FOUND', 'Game not found', 404);
  }

  const isRunner = actorUserId === reportRow.runner_user_id;
  const isHost = actorUserId === game.host_user_id;
  if (!isRunner && !isHost) {
    throw new AppError('FORBIDDEN', 'Only the target runner or host can reject a catch report', 403);
  }

  if (reportRow.status !== CatchReportStatus.PENDING && reportRow.status !== CatchReportStatus.DISPUTED) {
    throw new AppError('INVALID_STATE', `Cannot reject catch report in ${reportRow.status} status`, 400);
  }

  const { rows: updatedRows } = await query<{
    id: string;
    runner_user_id: string;
    seeker_user_id: string;
    status: CatchReportStatus;
    created_at: Date;
  }>(
    `UPDATE catch_reports
     SET status = 'REJECTED',
         reject_reason = $1,
         verified_by = $2,
         verified_at = NOW(),
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, runner_user_id, seeker_user_id, status, created_at`,
    [reason ?? 'Rejected by player', actorUserId, catchId]
  );

  const report = toCatchReportPublic(updatedRows[0]!);

  emitToGame(gameId, SocketEvent.CATCH_RESOLVED, {
    report,
    stateVersion: game.state_version,
    serverTime: new Date().toISOString(),
  });

  return report;
}

/**
 * Dispute a pending catch report (Runner action).
 * Moves report into DISPUTED status and alerts the match host.
 */
export async function disputeCatch(
  runnerUserId: string,
  gameId: string,
  catchId: string,
  reason?: string
): Promise<CatchReportPublic> {
  const { rows: catchRows } = await query<{
    id: string;
    runner_user_id: string;
    seeker_user_id: string;
    status: CatchReportStatus;
    created_at: Date;
  }>(
    `SELECT id, runner_user_id, seeker_user_id, status, created_at
     FROM catch_reports
     WHERE id = $1 AND game_id = $2`,
    [catchId, gameId]
  );

  const reportRow = catchRows[0];
  if (!reportRow) {
    throw new AppError('CATCH_NOT_FOUND', 'Catch report not found', 404);
  }
  if (reportRow.runner_user_id !== runnerUserId) {
    throw new AppError('FORBIDDEN', 'Only the target runner can dispute this catch report', 403);
  }
  if (reportRow.status !== CatchReportStatus.PENDING) {
    throw new AppError('INVALID_STATE', `Cannot dispute catch in ${reportRow.status} status`, 400);
  }

  const { rows: updatedRows } = await query<{
    id: string;
    runner_user_id: string;
    seeker_user_id: string;
    status: CatchReportStatus;
    created_at: Date;
  }>(
    `UPDATE catch_reports
     SET status = 'DISPUTED',
         reject_reason = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING id, runner_user_id, seeker_user_id, status, created_at`,
    [reason ?? 'Disputed by runner', catchId]
  );

  const report = toCatchReportPublic(updatedRows[0]!);

  const { rows: gameRows } = await query<{ host_user_id: string; state_version: number }>(
    'SELECT host_user_id, state_version FROM games WHERE id = $1',
    [gameId]
  );
  const game = gameRows[0];

  if (game) {
    emitToUser(game.host_user_id, SocketEvent.HOST_ALERT, {
      type: 'CATCH_DISPUTED',
      catchId,
      runnerUserId,
      reason: reason ?? 'Runner disputed physical catch',
      stateVersion: game.state_version,
      serverTime: new Date().toISOString(),
    });
  }

  emitToGame(gameId, SocketEvent.CATCH_RESOLVED, {
    report,
    stateVersion: game?.state_version ?? 1,
    serverTime: new Date().toISOString(),
  });

  return report;
}

/**
 * Host reverses a previously confirmed catch.
 * Reverts runner status back to ACTIVE.
 */
export async function reverseCatch(
  hostUserId: string,
  gameId: string,
  catchId: string
): Promise<CatchReportPublic> {
  const { rows: gameRows } = await query<{
    host_user_id: string;
    status: GameStatus;
    state_version: number;
  }>('SELECT host_user_id, status, state_version FROM games WHERE id = $1', [gameId]);

  const game = gameRows[0];
  if (!game || game.host_user_id !== hostUserId) {
    throw new AppError('FORBIDDEN', 'Only the match host can reverse a confirmed catch', 403);
  }
  if (game.status === GameStatus.FINISHED) {
    throw new AppError('GAME_FINISHED', 'Cannot reverse catch after match has finished', 400);
  }

  let updatedReport: CatchReportPublic | null = null;
  let remainingRunnersCount = 0;
  let totalRunnersCount = 0;
  let runnerUserId = '';
  let stateVersion = game.state_version + 1;

  await withTransaction(async (client) => {
    const { rows: catchRows } = await client.query<{
      id: string;
      runner_user_id: string;
      seeker_user_id: string;
      status: CatchReportStatus;
      created_at: Date;
    }>(
      `SELECT id, runner_user_id, seeker_user_id, status, created_at
       FROM catch_reports
       WHERE id = $1 AND game_id = $2
       FOR UPDATE`,
      [catchId, gameId]
    );

    const reportRow = catchRows[0];
    if (!reportRow) {
      throw new AppError('CATCH_NOT_FOUND', 'Catch report not found', 404);
    }
    if (reportRow.status !== CatchReportStatus.CONFIRMED) {
      throw new AppError('INVALID_STATE', 'Only confirmed catches can be reversed', 400);
    }

    runnerUserId = reportRow.runner_user_id;

    // Update catch report status to REJECTED (with reversal note)
    const { rows: updatedRows } = await client.query<{
      id: string;
      runner_user_id: string;
      seeker_user_id: string;
      status: CatchReportStatus;
      created_at: Date;
    }>(
      `UPDATE catch_reports
       SET status = 'REJECTED',
           reject_reason = 'Reversed by host',
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, runner_user_id, seeker_user_id, status, created_at`,
      [catchId]
    );

    updatedReport = toCatchReportPublic(updatedRows[0]!);

    // Revert runner back to ACTIVE
    await client.query(
      `UPDATE game_players
       SET status = 'ACTIVE'
       WHERE game_id = $1 AND user_id = $2`,
      [gameId, runnerUserId]
    );

    // Increment state version
    const { rows: versionRows } = await client.query<{ state_version: number }>(
      `UPDATE games
       SET state_version = state_version + 1
       WHERE id = $1
       RETURNING state_version`,
      [gameId]
    );
    stateVersion = versionRows[0]?.state_version ?? stateVersion;

    // Recalculate runner count
    const { rows: countRows } = await client.query<{
      remaining: string;
      total: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'ACTIVE') AS remaining,
         COUNT(*) AS total
       FROM game_players
       WHERE game_id = $1 AND role = 'RUNNER' AND status NOT IN ('LEFT', 'KICKED')`,
      [gameId]
    );

    remainingRunnersCount = parseInt(countRows[0]?.remaining ?? '0', 10);
    totalRunnersCount = parseInt(countRows[0]?.total ?? '0', 10);
  });

  const nowIso = new Date().toISOString();

  emitToGame(gameId, SocketEvent.CATCH_RESOLVED, {
    report: updatedReport!,
    stateVersion,
    serverTime: nowIso,
  });

  emitToGame(gameId, SocketEvent.PLAYERS_COUNT, {
    runnersLeft: remainingRunnersCount,
    totalRunners: totalRunnersCount,
    stateVersion,
    serverTime: nowIso,
  });

  return updatedReport!;
}

/**
 * List all catch reports for a game.
 */
export async function getGameCatches(gameId: string): Promise<CatchReportPublic[]> {
  const { rows } = await query<{
    id: string;
    runner_user_id: string;
    seeker_user_id: string;
    status: CatchReportStatus;
    created_at: Date;
  }>(
    `SELECT id, runner_user_id, seeker_user_id, status, created_at
     FROM catch_reports
     WHERE game_id = $1
     ORDER BY created_at DESC`,
    [gameId]
  );

  return rows.map(toCatchReportPublic);
}
