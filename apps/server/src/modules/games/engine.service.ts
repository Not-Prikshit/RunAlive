// apps/server/src/modules/games/engine.service.ts
// Game Engine state machine: starting, round transitions, pausing, resuming, match termination.

import {
  GameStatus,
  PlayerRole,
  PlayerStatus,
  SocketEvent,
  GameWinner,
  JobType,
  type GameStartedPayload,
  type GamePausedPayload,
  type GameResumedPayload,
  type GameRound,
} from '@runalive/shared';
import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../app.js';
import { emitToGame } from '../../realtime/socket.server.js';
import {
  scheduleJob,
  shiftGameJobDeadlines,
  cancelGameJobs,
  registerJobHandler,
} from '../../scheduler/scheduler.service.js';

interface GameStateRow {
  id: string;
  room_code: string;
  name: string;
  status: GameStatus;
  host_user_id: string;
  current_round: number;
  total_rounds: number;
  started_at: Date | null;
  ends_at: Date | null;
  round_ends_at: Date | null;
  paused_at: Date | null;
  total_paused_ms: string;
  announce_lead_seconds: number;
  runner_share_interval_seconds: number;
  state_version: number;
}

/**
 * Start game from lobby: validates teams, sets match timers, schedules jobs.
 */
export async function startGame(hostUserId: string, gameId: string): Promise<void> {
  const { rows: gameRows } = await query<GameStateRow>(
    `SELECT id, room_code, name, status, host_user_id, current_round, total_rounds,
            announce_lead_seconds, runner_share_interval_seconds, state_version
     FROM games WHERE id = $1`,
    [gameId]
  );

  const game = gameRows[0];
  if (!game) {
    throw new AppError('GAME_NOT_FOUND', 'Game not found', 404);
  }

  if (game.host_user_id !== hostUserId) {
    throw new AppError('FORBIDDEN', 'Only host can start the match', 403);
  }

  if (game.status !== GameStatus.LOBBY) {
    throw new AppError('INVALID_STATE', 'Game is not in lobby state', 400);
  }

  // Check players
  const { rows: players } = await query<{ role: PlayerRole; status: PlayerStatus }>(
    `SELECT role, status FROM game_players
     WHERE game_id = $1 AND status NOT IN ('LEFT', 'KICKED')`,
    [gameId]
  );

  const seekers = players.filter((p) => p.role === PlayerRole.SEEKER);
  const runners = players.filter((p) => p.role === PlayerRole.RUNNER);

  if (seekers.length === 0 || runners.length === 0) {
    throw new AppError(
      'TEAMS_NOT_READY',
      'Both Runners and Seekers must have at least one player to start.',
      400
    );
  }

  // Fetch rounds
  const { rows: roundRows } = await query<{
    round_number: number;
    duration_seconds: number;
    center_lat: number;
    center_lon: number;
    radius_m: number;
  }>(
    `SELECT round_number, duration_seconds, center_lat, center_lon, radius_m
     FROM game_rounds WHERE game_id = $1 ORDER BY round_number ASC`,
    [gameId]
  );

  if (roundRows.length === 0) {
    throw new AppError('NO_ROUNDS', 'Game has no configured rounds', 400);
  }

  const round1 = roundRows[0]!;
  const totalMatchSeconds = roundRows.reduce((acc, r) => acc + r.duration_seconds, 0);

  const now = new Date();
  const round1EndsAt = new Date(now.getTime() + round1.duration_seconds * 1000);
  const matchEndsAt = new Date(now.getTime() + totalMatchSeconds * 1000);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE games
       SET status = 'ACTIVE',
           current_round = 1,
           started_at = $1,
           round_ends_at = $2,
           ends_at = $3,
           state_version = state_version + 1
       WHERE id = $4`,
      [now, round1EndsAt, matchEndsAt, gameId]
    );

    // Schedule ROUND_ANNOUNCE if round 2 exists
    if (roundRows.length > 1) {
      const announceLeadMs = game.announce_lead_seconds * 1000;
      const announceTime = new Date(round1EndsAt.getTime() - announceLeadMs);
      if (announceTime > now) {
        await scheduleJob(JobType.ROUND_ANNOUNCE, announceTime, {
          gameId,
          payload: { targetRound: 2 },
          dedupeKey: `announce:${gameId}:round:2`,
          client,
        });
      }
    }

    // Schedule ROUND_END
    await scheduleJob(JobType.ROUND_END, round1EndsAt, {
      gameId,
      payload: { finishedRound: 1 },
      dedupeKey: `round_end:${gameId}:round:1`,
      client,
    });

    // Schedule MATCH_END
    await scheduleJob(JobType.MATCH_END, matchEndsAt, {
      gameId,
      dedupeKey: `match_end:${gameId}`,
      client,
    });
  });

  const currentRound: GameRound = {
    roundNumber: round1.round_number,
    durationSeconds: round1.duration_seconds,
    centerLat: Number(round1.center_lat),
    centerLon: Number(round1.center_lon),
    radiusM: Number(round1.radius_m),
  };

  const payload: GameStartedPayload = {
    endsAt: matchEndsAt.toISOString(),
    currentRound,
    roundEndsAt: round1EndsAt.toISOString(),
    stateVersion: game.state_version + 1,
    serverTime: now.toISOString(),
  };

  emitToGame(gameId, SocketEvent.GAME_STARTED, payload);
}

/**
 * Pause game (Host control).
 */
export async function pauseGame(hostUserId: string, gameId: string): Promise<void> {
  const { rows } = await query<GameStateRow>(
    'SELECT host_user_id, status, state_version FROM games WHERE id = $1',
    [gameId]
  );

  const game = rows[0];
  if (!game || game.host_user_id !== hostUserId) {
    throw new AppError('FORBIDDEN', 'Only host can pause the match', 403);
  }

  if (game.status !== GameStatus.ACTIVE) {
    throw new AppError('INVALID_STATE', 'Game is not currently active', 400);
  }

  const now = new Date();

  await query(
    `UPDATE games
     SET status = 'PAUSED',
         paused_at = $1,
         state_version = state_version + 1
     WHERE id = $2`,
    [now, gameId]
  );

  const payload: GamePausedPayload = {
    pausedAt: now.toISOString(),
    stateVersion: game.state_version + 1,
    serverTime: now.toISOString(),
  };

  emitToGame(gameId, SocketEvent.GAME_PAUSED, payload);
}

/**
 * Resume game from pause (Host control): computes elapsed pause time and shifts all deadlines.
 */
export async function resumeGame(hostUserId: string, gameId: string): Promise<void> {
  const { rows } = await query<GameStateRow>(
    `SELECT host_user_id, status, paused_at, round_ends_at, ends_at, state_version
     FROM games WHERE id = $1`,
    [gameId]
  );

  const game = rows[0];
  if (!game || game.host_user_id !== hostUserId) {
    throw new AppError('FORBIDDEN', 'Only host can resume the match', 403);
  }

  if (game.status !== GameStatus.PAUSED || !game.paused_at) {
    throw new AppError('INVALID_STATE', 'Game is not paused', 400);
  }

  const now = new Date();
  const pausedElapsedMs = now.getTime() - new Date(game.paused_at).getTime();

  const newRoundEndsAt = new Date(new Date(game.round_ends_at!).getTime() + pausedElapsedMs);
  const newEndsAt = new Date(new Date(game.ends_at!).getTime() + pausedElapsedMs);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE games
       SET status = 'ACTIVE',
           paused_at = NULL,
           total_paused_ms = total_paused_ms + $1,
           round_ends_at = $2,
           ends_at = $3,
           state_version = state_version + 1
       WHERE id = $4`,
      [pausedElapsedMs, newRoundEndsAt, newEndsAt, gameId]
    );

    // Shift all scheduled jobs for this game
    await shiftGameJobDeadlines(gameId, pausedElapsedMs, client);
  });

  const payload: GameResumedPayload = {
    resumedAt: now.toISOString(),
    endsAt: newEndsAt.toISOString(),
    roundEndsAt: newRoundEndsAt.toISOString(),
    stateVersion: game.state_version + 1,
    serverTime: now.toISOString(),
  };

  emitToGame(gameId, SocketEvent.GAME_RESUMED, payload);
}

/**
 * Emergency pause triggered by any active player.
 */
export async function emergencyPause(
  userId: string,
  gameId: string,
  reason = 'Safety pause requested'
): Promise<void> {
  const { rows } = await query<{ status: GameStatus; state_version: number }>(
    `SELECT g.status, g.state_version
     FROM games g
     JOIN game_players gp ON gp.game_id = g.id
     WHERE g.id = $1 AND gp.user_id = $2 AND gp.status = 'ACTIVE'`,
    [gameId, userId]
  );

  const game = rows[0];
  if (!game || game.status !== GameStatus.ACTIVE) {
    throw new AppError('INVALID_STATE', 'Game is not active or player is not participating', 400);
  }

  const now = new Date();

  await query(
    `UPDATE games
     SET status = 'PAUSED',
         paused_at = $1,
         state_version = state_version + 1
     WHERE id = $2`,
    [now, gameId]
  );

  emitToGame(gameId, SocketEvent.GAME_PAUSED, {
    pausedAt: now.toISOString(),
    emergency: true,
    reason,
    reportedByUserId: userId,
    stateVersion: game.state_version + 1,
    serverTime: now.toISOString(),
  });
}

/**
 * Terminate/Finish a game.
 */
export async function endGame(
  gameId: string,
  winner: GameWinner = GameWinner.RUNNERS,
  reason = 'Match completed'
): Promise<void> {
  const now = new Date();

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE games
       SET status = 'FINISHED',
           finished_at = $1,
           state_version = state_version + 1
       WHERE id = $2`,
      [now, gameId]
    );

    await cancelGameJobs(gameId, client);
  });

  emitToGame(gameId, SocketEvent.GAME_ENDED, {
    gameId,
    winner,
    reason,
    finishedAt: now.toISOString(),
  });
}

/**
 * Advance to next round (called by ROUND_END scheduled job handler).
 */
export async function advanceRound(gameId: string): Promise<void> {
  const { rows: gameRows } = await query<GameStateRow>(
    `SELECT id, current_round, total_rounds, announce_lead_seconds, state_version
     FROM games WHERE id = $1 AND status = 'ACTIVE'`,
    [gameId]
  );

  const game = gameRows[0];
  if (!game) return;

  const nextRoundNumber = game.current_round + 1;

  if (nextRoundNumber > game.total_rounds) {
    // All rounds finished -> Runners survive!
    await endGame(gameId, GameWinner.RUNNERS, 'All rounds completed');
    return;
  }

  const { rows: roundRows } = await query<{
    round_number: number;
    duration_seconds: number;
    center_lat: number;
    center_lon: number;
    radius_m: number;
  }>(
    'SELECT * FROM game_rounds WHERE game_id = $1 AND round_number = $2',
    [gameId, nextRoundNumber]
  );

  const nextRound = roundRows[0];
  if (!nextRound) {
    await endGame(gameId, GameWinner.RUNNERS, 'No further rounds found');
    return;
  }

  const now = new Date();
  const nextRoundEndsAt = new Date(now.getTime() + nextRound.duration_seconds * 1000);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE games
       SET current_round = $1,
           round_ends_at = $2,
           state_version = state_version + 1
       WHERE id = $3`,
      [nextRoundNumber, nextRoundEndsAt, gameId]
    );

    // Schedule next announce if subsequent round exists
    if (nextRoundNumber < game.total_rounds) {
      const announceTime = new Date(
        nextRoundEndsAt.getTime() - game.announce_lead_seconds * 1000
      );
      if (announceTime > now) {
        await scheduleJob(JobType.ROUND_ANNOUNCE, announceTime, {
          gameId,
          payload: { targetRound: nextRoundNumber + 1 },
          dedupeKey: `announce:${gameId}:round:${nextRoundNumber + 1}`,
          client,
        });
      }
    }

    // Schedule next ROUND_END
    await scheduleJob(JobType.ROUND_END, nextRoundEndsAt, {
      gameId,
      payload: { finishedRound: nextRoundNumber },
      dedupeKey: `round_end:${gameId}:round:${nextRoundNumber}`,
      client,
    });
  });

  emitToGame(gameId, SocketEvent.ROUND_STARTED, {
    currentRound: {
      roundNumber: nextRound.round_number,
      durationSeconds: nextRound.duration_seconds,
      centerLat: Number(nextRound.center_lat),
      centerLon: Number(nextRound.center_lon),
      radiusM: Number(nextRound.radius_m),
    },
    roundEndsAt: nextRoundEndsAt.toISOString(),
    stateVersion: game.state_version + 1,
    serverTime: now.toISOString(),
  });
}

// ── Register default Job Handlers ─────────────────────────────────────────────
registerJobHandler(JobType.ROUND_END, async (job) => {
  if (job.game_id) {
    await advanceRound(job.game_id);
  }
});

registerJobHandler(JobType.MATCH_END, async (job) => {
  if (job.game_id) {
    await endGame(job.game_id, GameWinner.RUNNERS, 'Overall match time expired');
  }
});
