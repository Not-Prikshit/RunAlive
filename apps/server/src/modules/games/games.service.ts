// apps/server/src/modules/games/games.service.ts
// Game & Lobby management service: creation, room codes, joining, ready states, team assignment

import crypto from 'node:crypto';
import {
  type CreateGameSchema,
  type GameConfigInput,
  type GameRoundInput,
  type PlayerSummary,
  type GameStateSummary,
  PlayerRole,
  PlayerStatus,
  GameStatus,
  SocketEvent,
} from '@runalive/shared';
import type { z } from 'zod';
import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../app.js';
import { emitToGame, emitToUser } from '../../realtime/socket.server.js';

const ROOM_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 unambiguous chars

/**
 * Generate a cryptographically random, collision-free 6-character room code.
 */
export async function generateRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_CHARSET[bytes[i]! % ROOM_CODE_CHARSET.length];
    }

    const { rows } = await query<{ count: string }>(
      `SELECT count(*) FROM games
       WHERE room_code = $1 AND status NOT IN ('FINISHED', 'CANCELLED')`,
      [code]
    );

    if (parseInt(rows[0]?.count ?? '0', 10) === 0) {
      return code;
    }
  }

  throw new AppError('CODE_GENERATION_FAILED', 'Failed to generate unique room code', 500);
}

export interface GameDetails {
  id: string;
  roomCode: string;
  name: string;
  status: GameStatus;
  hostUserId: string;
  maxPlayers: number;
  teamAssignmentMethod: string;
  hostParticipates: boolean;
  seekerCount: number | null;
  seekerRatio: number | null;
  announceLeadSeconds: number;
  runnerShareIntervalSeconds: number;
  violationGraceSeconds: number;
  catchVerificationMode: string;
  obfuscationGridM: number;
  locationLossThresholdSeconds: number;
  autoEliminateOnLocationLoss: boolean;
  requireAllReady: boolean;
  currentRound: number;
  totalRounds: number;
  startedAt: string | null;
  endsAt: string | null;
  roundEndsAt: string | null;
  pausedAt: string | null;
  stateVersion: number;
  createdAt: string;
  players: PlayerSummary[];
  rounds: GameRoundInput[];
}

/**
 * Helper to fetch full game player summaries.
 */
export async function getGamePlayers(gameId: string): Promise<PlayerSummary[]> {
  const { rows } = await query<{
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    role: PlayerRole;
    status: PlayerStatus;
    is_ready: boolean;
    connected: boolean;
    last_seen_at: Date | null;
  }>(
    `SELECT gp.user_id, u.display_name, u.avatar_url, gp.role, gp.status,
            gp.is_ready, gp.connected, gp.last_seen_at
     FROM game_players gp
     JOIN users u ON u.id = gp.user_id
     WHERE gp.game_id = $1 AND gp.status NOT IN ('LEFT', 'KICKED')
     ORDER BY gp.joined_at ASC`,
    [gameId]
  );

  return rows.map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    role: r.role,
    status: r.status,
    isReady: r.is_ready,
    isConnected: r.connected,
    lastSeenAt: r.last_seen_at ? r.last_seen_at.toISOString() : null,
  }));
}

/**
 * Emit updated lobby payload to all connected clients in game.
 */
export async function broadcastLobbyUpdate(gameId: string): Promise<void> {
  const { rows } = await query<{
    name: string;
    max_players: number;
    total_rounds: number;
    require_all_ready: boolean;
    state_version: number;
  }>(
    `SELECT name, max_players, total_rounds, require_all_ready, state_version
     FROM games WHERE id = $1`,
    [gameId]
  );

  const game = rows[0];
  if (!game) return;

  const players = await getGamePlayers(gameId);

  emitToGame(gameId, SocketEvent.LOBBY_UPDATED, {
    players,
    gameConfig: {
      name: game.name,
      maxPlayers: game.max_players,
      totalRounds: game.total_rounds,
      totalMatchDurationSeconds: 0,
      requireAllReady: game.require_all_ready,
    },
    stateVersion: game.state_version,
    serverTime: new Date().toISOString(),
  });
}

/**
 * Create a new game with room code and configured rounds.
 */
export async function createGame(
  hostUserId: string,
  input: {
    config: GameConfigInput;
    rounds: GameRoundInput[];
  }
): Promise<GameDetails> {
  const roomCode = await generateRoomCode();

  return withTransaction(async (client) => {
    const { rows: gameRows } = await client.query<{
      id: string;
      room_code: string;
      name: string;
      status: GameStatus;
      host_user_id: string;
      max_players: number;
      team_assignment_method: string;
      host_participates: boolean;
      seeker_count: number | null;
      seeker_ratio: number | null;
      announce_lead_seconds: number;
      runner_share_interval_seconds: number;
      violation_grace_seconds: number;
      catch_verification_mode: string;
      obfuscation_grid_m: number;
      location_loss_threshold_seconds: number;
      auto_eliminate_on_location_loss: boolean;
      require_all_ready: boolean;
      current_round: number;
      total_rounds: number;
      state_version: number;
      created_at: Date;
    }>(
      `INSERT INTO games (
        host_user_id, room_code, name, max_players, team_assignment_method,
        host_participates, seeker_count, seeker_ratio, announce_lead_seconds,
        runner_share_interval_seconds, violation_grace_seconds, catch_verification_mode,
        obfuscation_grid_m, location_loss_threshold_seconds, auto_eliminate_on_location_loss,
        require_all_ready, total_rounds, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'LOBBY')
      RETURNING id, room_code, name, status, host_user_id, max_players, team_assignment_method,
                host_participates, seeker_count, seeker_ratio, announce_lead_seconds,
                runner_share_interval_seconds, violation_grace_seconds, catch_verification_mode,
                obfuscation_grid_m, location_loss_threshold_seconds, auto_eliminate_on_location_loss,
                require_all_ready, current_round, total_rounds, state_version, created_at`,
      [
        hostUserId,
        roomCode,
        input.config.name,
        input.config.maxPlayers,
        input.config.teamAssignmentMethod,
        input.config.hostParticipates,
        input.config.seekerCount ?? null,
        input.config.seekerRatio ?? null,
        input.config.announceLeadSeconds,
        input.config.runnerShareIntervalSeconds,
        input.config.violationGraceSeconds,
        input.config.catchVerificationMode,
        input.config.obfuscationGridM,
        input.config.locationLossThresholdSeconds,
        input.config.autoEliminateOnLocationLoss,
        input.config.requireAllReady,
        input.rounds.length,
      ]
    );

    const game = gameRows[0]!;

    // Insert rounds
    for (const round of input.rounds) {
      await client.query(
        `INSERT INTO game_rounds (
          game_id, round_number, duration_seconds, center, radius_m, center_lat, center_lon
        ) VALUES (
          $1, $2, $3,
          ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography,
          $6, $4, $5
        )`,
        [
          game.id,
          round.roundNumber,
          round.durationSeconds,
          round.centerLat,
          round.centerLon,
          round.radiusM,
        ]
      );
    }

    // Add host as player
    const hostRole: PlayerRole = input.config.hostParticipates ? PlayerRole.RUNNER : PlayerRole.HOST;
    await client.query(
      `INSERT INTO game_players (game_id, user_id, role, status, is_ready)
       VALUES ($1, $2, $3, 'ACTIVE', $4)`,
      [game.id, hostUserId, hostRole, !input.config.requireAllReady]
    );

    // Fetch host user details
    const { rows: userRows } = await client.query<{
      display_name: string;
      avatar_url: string | null;
    }>('SELECT display_name, avatar_url FROM users WHERE id = $1', [hostUserId]);

    const hostUser = userRows[0]!;

    return {
      id: game.id,
      roomCode: game.room_code,
      name: game.name,
      status: game.status,
      hostUserId: game.host_user_id,
      maxPlayers: game.max_players,
      teamAssignmentMethod: game.team_assignment_method,
      hostParticipates: game.host_participates,
      seekerCount: game.seeker_count,
      seekerRatio: game.seeker_ratio,
      announceLeadSeconds: game.announce_lead_seconds,
      runnerShareIntervalSeconds: game.runner_share_interval_seconds,
      violationGraceSeconds: game.violation_grace_seconds,
      catchVerificationMode: game.catch_verification_mode,
      obfuscationGridM: game.obfuscation_grid_m,
      locationLossThresholdSeconds: game.location_loss_threshold_seconds,
      autoEliminateOnLocationLoss: game.auto_eliminate_on_location_loss,
      requireAllReady: game.require_all_ready,
      currentRound: game.current_round,
      totalRounds: game.total_rounds,
      startedAt: null,
      endsAt: null,
      roundEndsAt: null,
      pausedAt: null,
      stateVersion: game.state_version,
      createdAt: game.created_at.toISOString(),
      players: [
        {
          userId: hostUserId,
          displayName: hostUser.display_name,
          avatarUrl: hostUser.avatar_url,
          role: hostRole,
          status: PlayerStatus.ACTIVE,
          isReady: !input.config.requireAllReady,
          isConnected: true,
          lastSeenAt: new Date().toISOString(),
        },
      ],
      rounds: input.rounds,
    };
  });
}

/**
 * Get game details by ID.
 */
export async function getGameById(gameId: string): Promise<GameDetails> {
  const { rows: gameRows } = await query<{
    id: string;
    room_code: string;
    name: string;
    status: GameStatus;
    host_user_id: string;
    max_players: number;
    team_assignment_method: string;
    host_participates: boolean;
    seeker_count: number | null;
    seeker_ratio: number | null;
    announce_lead_seconds: number;
    runner_share_interval_seconds: number;
    violation_grace_seconds: number;
    catch_verification_mode: string;
    obfuscation_grid_m: number;
    location_loss_threshold_seconds: number;
    auto_eliminate_on_location_loss: boolean;
    require_all_ready: boolean;
    current_round: number;
    total_rounds: number;
    started_at: Date | null;
    ends_at: Date | null;
    round_ends_at: Date | null;
    paused_at: Date | null;
    state_version: number;
    created_at: Date;
  }>(
    `SELECT id, room_code, name, status, host_user_id, max_players, team_assignment_method,
            host_participates, seeker_count, seeker_ratio, announce_lead_seconds,
            runner_share_interval_seconds, violation_grace_seconds, catch_verification_mode,
            obfuscation_grid_m, location_loss_threshold_seconds, auto_eliminate_on_location_loss,
            require_all_ready, current_round, total_rounds, started_at, ends_at, round_ends_at,
            paused_at, state_version, created_at
     FROM games WHERE id = $1`,
    [gameId]
  );

  const game = gameRows[0];
  if (!game) {
    throw new AppError('GAME_NOT_FOUND', 'Game not found', 404);
  }

  const { rows: roundRows } = await query<{
    round_number: number;
    duration_seconds: number;
    center_lat: number;
    center_lon: number;
    radius_m: number;
  }>(
    `SELECT round_number, duration_seconds, center_lat, center_lon, radius_m
     FROM game_rounds
     WHERE game_id = $1
     ORDER BY round_number ASC`,
    [gameId]
  );

  const players = await getGamePlayers(gameId);

  return {
    id: game.id,
    roomCode: game.room_code,
    name: game.name,
    status: game.status,
    hostUserId: game.host_user_id,
    maxPlayers: game.max_players,
    teamAssignmentMethod: game.team_assignment_method,
    hostParticipates: game.host_participates,
    seekerCount: game.seeker_count,
    seekerRatio: game.seeker_ratio,
    announceLeadSeconds: game.announce_lead_seconds,
    runnerShareIntervalSeconds: game.runner_share_interval_seconds,
    violationGraceSeconds: game.violation_grace_seconds,
    catchVerificationMode: game.catch_verification_mode,
    obfuscationGridM: game.obfuscation_grid_m,
    locationLossThresholdSeconds: game.location_loss_threshold_seconds,
    autoEliminateOnLocationLoss: game.auto_eliminate_on_location_loss,
    requireAllReady: game.require_all_ready,
    currentRound: game.current_round,
    totalRounds: game.total_rounds,
    startedAt: game.started_at ? game.started_at.toISOString() : null,
    endsAt: game.ends_at ? game.ends_at.toISOString() : null,
    roundEndsAt: game.round_ends_at ? game.round_ends_at.toISOString() : null,
    pausedAt: game.paused_at ? game.paused_at.toISOString() : null,
    stateVersion: game.state_version,
    createdAt: game.created_at.toISOString(),
    players,
    rounds: roundRows.map((r) => ({
      roundNumber: r.round_number,
      durationSeconds: r.duration_seconds,
      centerLat: Number(r.center_lat),
      centerLon: Number(r.center_lon),
      radiusM: Number(r.radius_m),
    })),
  };
}

/**
 * Get lobby preview by room code for prospective joiners.
 */
export async function getGameByCode(roomCode: string): Promise<{
  id: string;
  roomCode: string;
  name: string;
  status: GameStatus;
  maxPlayers: number;
  playerCount: number;
  hostDisplayName: string;
}> {
  const code = roomCode.toUpperCase().trim();

  const { rows } = await query<{
    id: string;
    room_code: string;
    name: string;
    status: GameStatus;
    max_players: number;
    host_display_name: string;
    player_count: string;
  }>(
    `SELECT g.id, g.room_code, g.name, g.status, g.max_players,
            u.display_name AS host_display_name,
            COUNT(gp.id) FILTER (WHERE gp.status NOT IN ('LEFT', 'KICKED')) AS player_count
     FROM games g
     JOIN users u ON u.id = g.host_user_id
     LEFT JOIN game_players gp ON gp.game_id = g.id
     WHERE g.room_code = $1 AND g.status = 'LOBBY'
     GROUP BY g.id, u.display_name`,
    [code]
  );

  const game = rows[0];
  if (!game) {
    throw new AppError('GAME_NOT_FOUND', 'Active game lobby not found for this code', 404);
  }

  return {
    id: game.id,
    roomCode: game.room_code,
    name: game.name,
    status: game.status,
    maxPlayers: game.max_players,
    playerCount: parseInt(game.player_count, 10),
    hostDisplayName: game.host_display_name,
  };
}

/**
 * Join an active lobby by room code.
 */
export async function joinGame(
  userId: string,
  input: { roomCode: string; locationConsentAt: string }
): Promise<{ game: GameDetails; player: PlayerSummary }> {
  const code = input.roomCode.toUpperCase().trim();

  const { rows: gameRows } = await query<{
    id: string;
    status: GameStatus;
    max_players: number;
  }>(
    `SELECT id, status, max_players
     FROM games
     WHERE room_code = $1 AND status NOT IN ('FINISHED', 'CANCELLED')`,
    [code]
  );

  const game = gameRows[0];
  if (!game) {
    throw new AppError('GAME_NOT_FOUND', 'Game not found', 404);
  }

  if (game.status !== GameStatus.LOBBY) {
    throw new AppError('GAME_ALREADY_STARTED', 'Cannot join game that is already in progress', 400);
  }

  // Check player count
  const { rows: countRows } = await query<{ count: string }>(
    `SELECT count(*) FROM game_players
     WHERE game_id = $1 AND status NOT IN ('LEFT', 'KICKED')`,
    [game.id]
  );

  const activeCount = parseInt(countRows[0]?.count ?? '0', 10);

  // Check if player already in game
  const { rows: existingRows } = await query<{
    id: string;
    status: PlayerStatus;
    role: PlayerRole;
  }>(
    `SELECT id, status, role FROM game_players
     WHERE game_id = $1 AND user_id = $2`,
    [game.id, userId]
  );

  const existing = existingRows[0];
  if (existing) {
    if (existing.status === PlayerStatus.KICKED) {
      throw new AppError('PLAYER_KICKED', 'You were removed from this game by the host', 403);
    }

    if (existing.status === PlayerStatus.LEFT) {
      // Re-join
      await query(
        `UPDATE game_players
         SET status = 'ACTIVE', location_consent_at = $1, is_ready = false
         WHERE id = $2`,
        [input.locationConsentAt, existing.id]
      );
    }
  } else {
    if (activeCount >= game.max_players) {
      throw new AppError('GAME_FULL', 'Game lobby has reached maximum player capacity', 400);
    }

    // Default role for joiner is RUNNER
    await query(
      `INSERT INTO game_players (game_id, user_id, role, status, is_ready, location_consent_at)
       VALUES ($1, $2, 'RUNNER', 'ACTIVE', false, $3)`,
      [game.id, userId, input.locationConsentAt]
    );
  }

  // Update state version
  await query('UPDATE games SET state_version = state_version + 1 WHERE id = $1', [game.id]);

  const fullGame = await getGameById(game.id);
  const player = fullGame.players.find((p) => p.userId === userId)!;

  await broadcastLobbyUpdate(game.id);

  return { game: fullGame, player };
}

/**
 * Leave a game lobby.
 */
export async function leaveGame(userId: string, gameId: string): Promise<void> {
  const { rows: gameRows } = await query<{ host_user_id: string; status: GameStatus }>(
    'SELECT host_user_id, status FROM games WHERE id = $1',
    [gameId]
  );

  const game = gameRows[0];
  if (!game) return;

  if (game.host_user_id === userId) {
    // If host leaves during LOBBY, game is cancelled
    if (game.status === GameStatus.LOBBY) {
      await query("UPDATE games SET status = 'CANCELLED' WHERE id = $1", [gameId]);
      emitToGame(gameId, SocketEvent.GAME_ENDED, {
        gameId,
        reason: 'Host left the game',
      });
      return;
    }
  }

  await query(
    `UPDATE game_players
     SET status = 'LEFT', connected = false
     WHERE game_id = $1 AND user_id = $2`,
    [gameId, userId]
  );

  await query('UPDATE games SET state_version = state_version + 1 WHERE id = $1', [gameId]);
  await broadcastLobbyUpdate(gameId);
}

/**
 * Toggle ready state in lobby.
 */
export async function setReady(userId: string, gameId: string, isReady: boolean): Promise<void> {
  const { rows } = await query<{ status: GameStatus }>(
    'SELECT status FROM games WHERE id = $1',
    [gameId]
  );

  if (rows[0]?.status !== GameStatus.LOBBY) {
    throw new AppError('INVALID_STATE', 'Ready state can only be changed in lobby', 400);
  }

  await query(
    `UPDATE game_players
     SET is_ready = $1
     WHERE game_id = $2 AND user_id = $3 AND status = 'ACTIVE'`,
    [isReady, gameId, userId]
  );

  await broadcastLobbyUpdate(gameId);
}

/**
 * Assign team role manually (Host only).
 */
export async function assignRole(
  hostUserId: string,
  gameId: string,
  targetUserId: string,
  role: PlayerRole
): Promise<void> {
  const { rows: gameRows } = await query<{ host_user_id: string; status: GameStatus }>(
    'SELECT host_user_id, status FROM games WHERE id = $1',
    [gameId]
  );

  const game = gameRows[0];
  if (!game || game.host_user_id !== hostUserId) {
    throw new AppError('FORBIDDEN', 'Only the game host can assign roles', 403);
  }

  if (game.status !== GameStatus.LOBBY) {
    throw new AppError('INVALID_STATE', 'Roles can only be assigned in lobby', 400);
  }

  await query(
    `UPDATE game_players
     SET role = $1
     WHERE game_id = $2 AND user_id = $3 AND status = 'ACTIVE'`,
    [role, gameId, targetUserId]
  );

  await broadcastLobbyUpdate(gameId);
}

/**
 * Randomize teams based on seeker count or seeker ratio (Host only).
 */
export async function randomizeTeams(
  hostUserId: string,
  gameId: string,
  options?: { seekerCount?: number | undefined; seekerRatio?: number | undefined }
): Promise<void> {
  const { rows: gameRows } = await query<{
    host_user_id: string;
    status: GameStatus;
    host_participates: boolean;
    seeker_count: number | null;
    seeker_ratio: number | null;
  }>(
    `SELECT host_user_id, status, host_participates, seeker_count, seeker_ratio
     FROM games WHERE id = $1`,
    [gameId]
  );

  const game = gameRows[0];
  if (!game || game.host_user_id !== hostUserId) {
    throw new AppError('FORBIDDEN', 'Only the game host can randomize teams', 403);
  }

  if (game.status !== GameStatus.LOBBY) {
    throw new AppError('INVALID_STATE', 'Teams can only be randomized in lobby', 400);
  }

  // Get active players eligible for team assignment
  const { rows: playerRows } = await query<{ user_id: string }>(
    `SELECT user_id FROM game_players
     WHERE game_id = $1 AND status = 'ACTIVE'
       AND ($2::boolean OR user_id != $3)
     ORDER BY joined_at ASC`,
    [gameId, game.host_participates, hostUserId]
  );

  const count = playerRows.length;
  if (count < 2) {
    throw new AppError('NOT_ENOUGH_PLAYERS', 'At least 2 participating players are required to assign teams', 400);
  }

  // Determine seeker count
  let seekers = options?.seekerCount ?? game.seeker_count;
  if (!seekers) {
    const ratio = options?.seekerRatio ?? (game.seeker_ratio ? Number(game.seeker_ratio) : null);
    if (ratio) {
      seekers = Math.max(1, Math.round(count * ratio));
    } else {
      // Default rule: 1 seeker for <= 4 players, 2 for <= 8, or round(N * 0.25)
      seekers = count <= 4 ? 1 : count <= 8 ? 2 : Math.max(1, Math.round(count * 0.25));
    }
  }

  // Ensure at least 1 runner and 1 seeker
  seekers = Math.min(Math.max(1, seekers), count - 1);

  // Fisher-Yates shuffle
  const userIds = playerRows.map((p) => p.user_id);
  for (let i = userIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [userIds[i], userIds[j]] = [userIds[j]!, userIds[i]!];
  }

  const seekerIds = userIds.slice(0, seekers);
  const runnerIds = userIds.slice(seekers);

  await withTransaction(async (client) => {
    if (seekerIds.length > 0) {
      await client.query(
        `UPDATE game_players SET role = 'SEEKER'
         WHERE game_id = $1 AND user_id = ANY($2::uuid[])`,
        [gameId, seekerIds]
      );
    }

    if (runnerIds.length > 0) {
      await client.query(
        `UPDATE game_players SET role = 'RUNNER'
         WHERE game_id = $1 AND user_id = ANY($2::uuid[])`,
        [gameId, runnerIds]
      );
    }
  });

  await broadcastLobbyUpdate(gameId);
}

/**
 * Kick a player from lobby (Host only).
 */
export async function kickPlayer(
  hostUserId: string,
  gameId: string,
  targetUserId: string
): Promise<void> {
  const { rows: gameRows } = await query<{ host_user_id: string; status: GameStatus }>(
    'SELECT host_user_id, status FROM games WHERE id = $1',
    [gameId]
  );

  const game = gameRows[0];
  if (!game || game.host_user_id !== hostUserId) {
    throw new AppError('FORBIDDEN', 'Only the game host can kick players', 403);
  }

  if (targetUserId === hostUserId) {
    throw new AppError('INVALID_TARGET', 'Host cannot kick themselves', 400);
  }

  await query(
    `UPDATE game_players
     SET status = 'KICKED', connected = false
     WHERE game_id = $1 AND user_id = $2`,
    [gameId, targetUserId]
  );

  emitToUser(targetUserId, 'lobby:kicked', { gameId, reason: 'Removed by host' });
  await broadcastLobbyUpdate(gameId);
}
