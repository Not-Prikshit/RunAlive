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
  type GameResult,
  type ParticipationRecord,
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
 * Terminate/Finish a game and persist match results & player participations.
 */
export async function endGame(
  gameId: string,
  winner: GameWinner = GameWinner.RUNNERS,
  reason = 'Match completed'
): Promise<void> {
  const now = new Date();

  await withTransaction(async (client) => {
    const { rows: gRows } = await client.query<{
      started_at: Date | null;
      current_round: number;
      total_paused_ms: number;
    }>(
      'SELECT started_at, current_round, total_paused_ms FROM games WHERE id = $1',
      [gameId]
    );
    const game = gRows[0];
    const startedAt = game?.started_at ? new Date(game.started_at) : now;
    const totalPausedMs = game?.total_paused_ms ?? 0;
    const matchDurationSec = Math.max(0, Math.round((now.getTime() - startedAt.getTime() - totalPausedMs) / 1000));
    const roundsCompleted = game?.current_round ?? 1;

    // Count runner stats
    const { rows: statsRows } = await client.query<{
      caught: string;
      disqualified: string;
      remaining: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE role = 'RUNNER' AND status = 'CAUGHT') AS caught,
         COUNT(*) FILTER (WHERE role = 'RUNNER' AND status = 'DISQUALIFIED') AS disqualified,
         COUNT(*) FILTER (WHERE role = 'RUNNER' AND status = 'ACTIVE') AS remaining
       FROM game_players
       WHERE game_id = $1`,
      [gameId]
    );

    const runnersCaught = parseInt(statsRows[0]?.caught ?? '0', 10);
    const runnersDisqualified = parseInt(statsRows[0]?.disqualified ?? '0', 10);
    const runnersRemaining = parseInt(statsRows[0]?.remaining ?? '0', 10);

    await client.query(
      `UPDATE games
       SET status = 'FINISHED',
           finished_at = $1,
           state_version = state_version + 1
       WHERE id = $2`,
      [now, gameId]
    );

    // Insert or update game_results
    await client.query(
      `INSERT INTO game_results (
         game_id, winner, match_duration_seconds, rounds_completed,
         runners_caught, runners_disqualified, runners_remaining, finished_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (game_id) DO UPDATE
         SET winner = EXCLUDED.winner,
             match_duration_seconds = EXCLUDED.match_duration_seconds,
             rounds_completed = EXCLUDED.rounds_completed,
             runners_caught = EXCLUDED.runners_caught,
             runners_disqualified = EXCLUDED.runners_disqualified,
             runners_remaining = EXCLUDED.runners_remaining,
             finished_at = EXCLUDED.finished_at`,
      [
        gameId,
        winner,
        matchDurationSec,
        roundsCompleted,
        runnersCaught,
        runnersDisqualified,
        runnersRemaining,
        now,
      ]
    );

    // Insert game_participations for each player
    const { rows: playerRows } = await client.query<{
      user_id: string;
      role: PlayerRole;
      status: PlayerStatus;
    }>(
      `SELECT user_id, role, status
       FROM game_players
       WHERE game_id = $1 AND status NOT IN ('LEFT', 'KICKED')`,
      [gameId]
    );

    for (const p of playerRows) {
      let outcome: 'WIN' | 'LOSS' | 'DRAW' = 'DRAW';
      if (winner === GameWinner.RUNNERS) {
        outcome = p.role === PlayerRole.RUNNER && p.status !== PlayerStatus.DISQUALIFIED ? 'WIN' : 'LOSS';
      } else if (winner === GameWinner.SEEKERS) {
        outcome = p.role === PlayerRole.SEEKER ? 'WIN' : 'LOSS';
      }

      // Count catches made by this player
      const { rows: catchCountRows } = await client.query<{ count: string }>(
        `SELECT COUNT(*) FROM catch_reports
         WHERE game_id = $1 AND seeker_user_id = $2 AND status = 'CONFIRMED'`,
        [gameId, p.user_id]
      );
      const catchesMade = parseInt(catchCountRows[0]?.count ?? '0', 10);

      await client.query(
        `INSERT INTO game_participations (
           game_id, user_id, role, outcome, survival_seconds, catches_made, was_disqualified, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT DO NOTHING`,
        [
          gameId,
          p.user_id,
          p.role,
          outcome,
          p.role === PlayerRole.RUNNER ? matchDurationSec : null,
          catchesMade,
          p.status === PlayerStatus.DISQUALIFIED,
        ]
      );
    }

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
 * Fetch results and participations for a finished game.
 */
export async function getGameResults(
  gameId: string
): Promise<GameResult & { participations: ParticipationRecord[] }> {
  const { rows: resultRows } = await query<{
    game_id: string;
    winner: GameWinner;
    match_duration_seconds: number;
    rounds_completed: number;
    runners_caught: number;
    runners_disqualified: number;
    runners_remaining: number;
    finished_at: Date;
  }>(
    `SELECT game_id, winner, match_duration_seconds, rounds_completed,
            runners_caught, runners_disqualified, runners_remaining, finished_at
     FROM game_results
     WHERE game_id = $1`,
    [gameId]
  );

  const res = resultRows[0];
  if (!res) {
    throw new AppError('RESULTS_NOT_FOUND', 'Match results not found or game is not finished', 404);
  }

  const { rows: partRows } = await query<{
    game_id: string;
    game_name: string;
    role: PlayerRole;
    outcome: 'WIN' | 'LOSS' | 'DRAW';
    survival_seconds: number | null;
    catches_made: number;
    was_disqualified: boolean;
    created_at: Date;
  }>(
    `SELECT gp.game_id, g.name AS game_name, gp.role, gp.outcome,
            gp.survival_seconds, gp.catches_made, gp.was_disqualified, gp.created_at
     FROM game_participations gp
     JOIN games g ON g.id = gp.game_id
     WHERE gp.game_id = $1`,
    [gameId]
  );

  return {
    gameId: res.game_id,
    winner: res.winner,
    matchDurationSeconds: res.match_duration_seconds,
    roundsCompleted: res.rounds_completed,
    runnersCaught: res.runners_caught,
    runnersDisqualified: res.runners_disqualified,
    runnersRemaining: res.runners_remaining,
    finishedAt: new Date(res.finished_at).toISOString(),
    participations: partRows.map((p) => ({
      gameId: p.game_id,
      gameName: p.game_name,
      role: p.role,
      outcome: p.outcome,
      survivalSeconds: p.survival_seconds,
      catchesMade: p.catches_made,
      wasDisqualified: p.was_disqualified,
      playedAt: new Date(p.created_at).toISOString(),
    })),
  };
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
