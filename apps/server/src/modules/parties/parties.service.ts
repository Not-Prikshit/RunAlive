// apps/server/src/modules/parties/parties.service.ts
import crypto from 'node:crypto';
import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../app.js';
import { emitToParty, emitToGame, emitToUser } from '../../realtime/socket.server.js';
import {
  PlayerRole,
  PartyStatus,
  SocketEvent,
  type PartySummary,
  type PartyMemberSummary,
  type PartyChatMessage,
  type PartyAnnouncement,
} from '@runalive/shared';
import * as gamesService from '../games/games.service.js';
import * as engineService from '../games/engine.service.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function generateUniquePartyCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let j = 0; j < 6; j++) {
      code += CODE_CHARS[bytes[j]! % CODE_CHARS.length];
    }
    const { rows } = await query<{ count: string }>(
      `SELECT count(*) FROM parties WHERE party_code = $1 AND status != 'EXPIRED'`,
      [code]
    );
    if (parseInt(rows[0]?.count || '0', 10) === 0) {
      return code;
    }
  }
  throw new AppError('CODE_GENERATION_FAILED', 'Failed to generate unique party code', 500);
}

export async function createParty(
  leaderUserId: string,
  input: {
    maxMembers?: number | undefined;
    lockWhenMatchStarts?: boolean | undefined;
    revealSeekersOnMap?: boolean | undefined;
    settings?: Record<string, any> | undefined;
  } = {}
): Promise<PartySummary> {
  const partyCode = await generateUniquePartyCode();
  const maxMembers = Math.min(50, Math.max(2, input.maxMembers ?? 16));
  const lockWhenMatchStarts = input.lockWhenMatchStarts ?? true;
  const revealSeekersOnMap = input.revealSeekersOnMap ?? true;
  const settings = input.settings ?? {};

  const party = await withTransaction(async (client) => {
    const { rows: partyRows } = await client.query<{
      id: string;
      party_code: string;
      leader_user_id: string;
      status: PartyStatus;
      max_members: number;
      lock_when_match_starts: boolean;
      reveal_seekers_on_map: boolean;
      active_match_id: string | null;
      settings: any;
      created_at: Date;
    }>(
      `INSERT INTO parties (
        party_code, leader_user_id, status, max_members,
        lock_when_match_starts, reveal_seekers_on_map, settings
      ) VALUES ($1, $2, 'OPEN', $3, $4, $5, $6)
      RETURNING *`,
      [partyCode, leaderUserId, maxMembers, lockWhenMatchStarts, revealSeekersOnMap, JSON.stringify(settings)]
    );

    const created = partyRows[0]!;

    // Leader is auto-joined as first member
    await client.query(
      `INSERT INTO party_members (party_id, user_id, role, is_ready, is_connected)
       VALUES ($1, $2, 'HOST', true, true)`,
      [created.id, leaderUserId]
    );

    // Initial system announcement
    await client.query(
      `INSERT INTO party_announcements (party_id, sender_user_id, announcement_type, message)
       VALUES ($1, $2, 'SYSTEM', 'Party lobby established. Gathering squad.')`,
      [created.id, leaderUserId]
    );

    return created;
  });

  return getPartyById(party.id);
}

export async function getPartyById(partyId: string): Promise<PartySummary> {
  const { rows: partyRows } = await query<{
    id: string;
    party_code: string;
    leader_user_id: string;
    status: PartyStatus;
    max_members: number;
    lock_when_match_starts: boolean;
    reveal_seekers_on_map: boolean;
    active_match_id: string | null;
    created_at: Date;
  }>(
    `SELECT id, party_code, leader_user_id, status, max_members,
            lock_when_match_starts, reveal_seekers_on_map, active_match_id,
            created_at
     FROM parties
     WHERE id = $1`,
    [partyId]
  );

  const party = partyRows[0];
  if (!party) {
    throw new AppError('PARTY_NOT_FOUND', 'Party room does not exist', 404);
  }

  const { rows: memberRows } = await query<{
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    role: PlayerRole;
    is_ready: boolean;
    is_connected: boolean;
    joined_at: Date;
  }>(
    `SELECT pm.user_id, u.display_name, u.avatar_url, pm.role,
            pm.is_ready, pm.is_connected, pm.joined_at
     FROM party_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.party_id = $1 AND pm.left_at IS NULL
     ORDER BY pm.joined_at ASC`,
    [partyId]
  );

  const members: PartyMemberSummary[] = memberRows.map((m) => ({
    userId: m.user_id,
    displayName: m.display_name,
    avatarUrl: m.avatar_url,
    role: m.role,
    isReady: m.is_ready,
    isConnected: m.is_connected,
    isHost: m.user_id === party.leader_user_id,
    joinedAt: m.joined_at.toISOString(),
  }));

  return {
    id: party.id,
    partyCode: party.party_code,
    leaderUserId: party.leader_user_id,
    status: party.status,
    maxMembers: party.max_members,
    memberCount: members.length,
    lockWhenMatchStarts: party.lock_when_match_starts,
    revealSeekersOnMap: party.reveal_seekers_on_map,
    activeMatchId: party.active_match_id,
    members,
    createdAt: party.created_at.toISOString(),
  };
}

export async function getPartyByCode(partyCode: string): Promise<PartySummary> {
  const code = partyCode.trim().toUpperCase();
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM parties WHERE party_code = $1 AND status != 'EXPIRED'`,
    [code]
  );
  if (!rows[0]) {
    throw new AppError('PARTY_NOT_FOUND', 'Party not found with this code', 404);
  }
  return getPartyById(rows[0].id);
}

export async function joinParty(
  userId: string,
  input: { partyCode: string }
): Promise<PartySummary> {
  const code = input.partyCode.trim().toUpperCase();

  const { rows: partyRows } = await query<{
    id: string;
    status: PartyStatus;
    max_members: number;
    lock_when_match_starts: boolean;
    active_match_id: string | null;
  }>(
    `SELECT id, status, max_members, lock_when_match_starts, active_match_id
     FROM parties
     WHERE party_code = $1`,
    [code]
  );

  const party = partyRows[0];
  if (!party) {
    throw new AppError('PARTY_NOT_FOUND', 'Party does not exist. Verify the room code.', 404);
  }

  if (party.status === 'CLOSED') {
    throw new AppError('PARTY_CLOSED', 'This party has been closed by the host.', 403);
  }
  if (party.status === 'EXPIRED') {
    throw new AppError('PARTY_EXPIRED', 'This party code has expired.', 410);
  }

  // Active match check & Lock Room validation
  if (party.active_match_id && party.lock_when_match_starts) {
    // Check if player was an existing member in the frozen match snapshot
    const { rows: existingSnap } = await query<{ id: string; status: string }>(
      `SELECT id, status FROM game_players WHERE game_id = $1 AND user_id = $2`,
      [party.active_match_id, userId]
    );
    if (!existingSnap[0] || existingSnap[0].status === 'LEFT' || existingSnap[0].status === 'KICKED') {
      throw new AppError(
        'MATCH_LOCKED_NO_REJOIN',
        'Match has already commenced and the room is locked. New players and departed players cannot join.',
        403
      );
    }
  }

  // Check member count
  const { rows: countRows } = await query<{ count: string }>(
    `SELECT count(*) FROM party_members WHERE party_id = $1 AND left_at IS NULL`,
    [party.id]
  );
  const activeCount = parseInt(countRows[0]?.count || '0', 10);
  if (activeCount >= party.max_members) {
    throw new AppError('PARTY_FULL', `Party is full (maximum ${party.max_members} players).`, 409);
  }

  // Join or re-activate in party_members
  await query(
    `INSERT INTO party_members (party_id, user_id, role, is_ready, is_connected, joined_at, left_at)
     VALUES ($1, $2, 'RUNNER', false, true, NOW(), NULL)
     ON CONFLICT (party_id, user_id) DO UPDATE
       SET left_at = NULL, is_connected = true, is_ready = false`,
    [party.id, userId]
  );

  // Fetch joining user's display name
  const { rows: userRows } = await query<{ display_name: string }>(
    `SELECT display_name FROM users WHERE id = $1`,
    [userId]
  );
  const displayName = userRows[0]?.display_name || 'A player';

  await postAnnouncement(party.id, null, `${displayName} joined the party.`, 'EVENT');

  const updatedParty = await getPartyById(party.id);
  emitToParty(party.id, SocketEvent.PARTY_UPDATED, { party: updatedParty });

  return updatedParty;
}

export async function leaveParty(
  userId: string,
  partyId: string
): Promise<{ success: boolean; closed?: boolean }> {
  const { rows: partyRows } = await query<{
    id: string;
    leader_user_id: string;
    status: PartyStatus;
  }>(
    `SELECT id, leader_user_id, status FROM parties WHERE id = $1`,
    [partyId]
  );
  const party = partyRows[0];
  if (!party) return { success: true };

  // Mark member as left
  await query(
    `UPDATE party_members
     SET left_at = NOW(), is_connected = false, is_ready = false
     WHERE party_id = $1 AND user_id = $2`,
    [partyId, userId]
  );

  // Get user display name
  const { rows: userRows } = await query<{ display_name: string }>(
    `SELECT display_name FROM users WHERE id = $1`,
    [userId]
  );
  const displayName = userRows[0]?.display_name || 'A player';

  // Check remaining members
  const { rows: remaining } = await query<{ user_id: string }>(
    `SELECT user_id FROM party_members WHERE party_id = $1 AND left_at IS NULL ORDER BY joined_at ASC`,
    [partyId]
  );

  let closed = false;
  if (remaining.length === 0) {
    // Empty party -> close it
    await query(`UPDATE parties SET status = 'CLOSED' WHERE id = $1`, [partyId]);
    closed = true;
    emitToParty(partyId, SocketEvent.PARTY_CLOSED, { partyId });
  } else if (party.leader_user_id === userId) {
    // Leader left -> transfer host leadership to oldest remaining member
    const newLeaderId = remaining[0]!.user_id;
    await query(
      `UPDATE parties SET leader_user_id = $1 WHERE id = $2`,
      [newLeaderId, partyId]
    );
    await query(
      `UPDATE party_members SET role = 'HOST' WHERE party_id = $1 AND user_id = $2`,
      [partyId, newLeaderId]
    );

    const { rows: newLeaderRows } = await query<{ display_name: string }>(
      `SELECT display_name FROM users WHERE id = $1`,
      [newLeaderId]
    );
    await postAnnouncement(
      partyId,
      null,
      `${displayName} left. Leadership transferred to ${newLeaderRows[0]?.display_name || 'new host'}.`,
      'EVENT'
    );
  } else {
    await postAnnouncement(partyId, null, `${displayName} left the party.`, 'EVENT');
  }

  if (!closed) {
    const updatedParty = await getPartyById(partyId);
    emitToParty(partyId, SocketEvent.PARTY_UPDATED, { party: updatedParty });
    emitToParty(partyId, SocketEvent.PARTY_MEMBER_LEFT, { partyId, userId });
  }

  return { success: true, closed };
}

export async function setMemberReady(
  partyId: string,
  userId: string,
  isReady: boolean
): Promise<PartySummary> {
  await query(
    `UPDATE party_members
     SET is_ready = $1
     WHERE party_id = $2 AND user_id = $3 AND left_at IS NULL`,
    [isReady, partyId, userId]
  );

  const party = await getPartyById(partyId);
  emitToParty(partyId, SocketEvent.PARTY_UPDATED, { party });
  return party;
}

export async function setMemberRole(
  partyId: string,
  requesterUserId: string,
  targetUserId: string,
  role: PlayerRole
): Promise<PartySummary> {
  const party = await getPartyById(partyId);
  if (party.leaderUserId !== requesterUserId && requesterUserId !== targetUserId) {
    throw new AppError('FORBIDDEN', 'Only the party leader can assign roles.', 403);
  }

  await query(
    `UPDATE party_members
     SET role = $1
     WHERE party_id = $2 AND user_id = $3 AND left_at IS NULL`,
    [role, partyId, targetUserId]
  );

  const updatedParty = await getPartyById(partyId);
  emitToParty(partyId, SocketEvent.PARTY_UPDATED, { party: updatedParty });
  return updatedParty;
}

export async function kickMember(
  partyId: string,
  hostUserId: string,
  targetUserId: string
): Promise<PartySummary> {
  const party = await getPartyById(partyId);
  if (party.leaderUserId !== hostUserId) {
    throw new AppError('FORBIDDEN', 'Only the party leader can remove players.', 403);
  }
  if (hostUserId === targetUserId) {
    throw new AppError('BAD_REQUEST', 'Host cannot kick themselves. Use Leave Party.', 400);
  }

  await query(
    `UPDATE party_members
     SET left_at = NOW(), is_connected = false
     WHERE party_id = $1 AND user_id = $2`,
    [partyId, targetUserId]
  );

  emitToUser(targetUserId, 'party:kicked', { partyId });
  await postAnnouncement(partyId, null, `A player was removed by the host.`, 'WARNING');

  const updatedParty = await getPartyById(partyId);
  emitToParty(partyId, SocketEvent.PARTY_UPDATED, { party: updatedParty });
  return updatedParty;
}

export async function updatePartySettings(
  partyId: string,
  hostUserId: string,
  settings: {
    lockWhenMatchStarts?: boolean | undefined;
    revealSeekersOnMap?: boolean | undefined;
    customSettings?: Record<string, any> | undefined;
  }
): Promise<PartySummary> {
  const party = await getPartyById(partyId);
  if (party.leaderUserId !== hostUserId) {
    throw new AppError('FORBIDDEN', 'Only the party leader can modify settings.', 403);
  }

  const lockWhenMatchStarts = settings.lockWhenMatchStarts ?? party.lockWhenMatchStarts;
  const revealSeekersOnMap = settings.revealSeekersOnMap ?? party.revealSeekersOnMap;

  await query(
    `UPDATE parties
     SET lock_when_match_starts = $1,
         reveal_seekers_on_map = $2,
         settings = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [lockWhenMatchStarts, revealSeekersOnMap, JSON.stringify(settings.customSettings ?? {}), partyId]
  );

  const updated = await getPartyById(partyId);
  emitToParty(partyId, SocketEvent.PARTY_UPDATED, { party: updated });
  return updated;
}

export async function startMatchFromParty(
  partyId: string,
  hostUserId: string,
  matchConfig: {
    name?: string | undefined;
    boundaryCenterLat?: number | undefined;
    boundaryCenterLng?: number | undefined;
    boundaryRadiusMeters?: number | undefined;
    boundaryShape?: 'CIRCLE' | 'RECTANGLE' | 'POLYGON' | undefined;
    rectWidthMeters?: number | undefined;
    rectHeightMeters?: number | undefined;
    rectRotationDeg?: number | undefined;
    polygonPoints?: Array<[number, number]> | undefined;
    totalRounds?: number | undefined;
    roundDurationMinutes?: number | undefined;
  }
): Promise<{ matchId: string; roomCode: string }> {
  const party = await getPartyById(partyId);
  if (party.leaderUserId !== hostUserId) {
    throw new AppError('FORBIDDEN', 'Only the party leader can start the match.', 403);
  }

  // Server-validated snapshot of all active party members
  const activeMembers = party.members;
  if (activeMembers.length < 1) {
    throw new AppError('NOT_ENOUGH_PLAYERS', 'At least 1 player is required to commence.', 400);
  }

  // Create discrete game match session
  const lat = matchConfig.boundaryCenterLat ?? 28.4595;
  const lng = matchConfig.boundaryCenterLng ?? 77.5135;
  const radius = matchConfig.boundaryRadiusMeters ?? 500;
  const durationSec = (matchConfig.roundDurationMinutes ?? 15) * 60;
  const totalRounds = matchConfig.totalRounds ?? 1;

  const rounds = [];
  for (let r = 1; r <= totalRounds; r++) {
    rounds.push({
      roundNumber: r,
      durationSeconds: durationSec,
      centerLat: lat,
      centerLon: lng,
      radiusM: Math.max(50, Math.round(radius * Math.pow(0.75, r - 1))),
    });
  }

  const createdGame = await gamesService.createGame(hostUserId, {
    config: {
      name: matchConfig.name || `Match-${party.partyCode}`,
      maxPlayers: party.maxMembers,
      teamAssignmentMethod: 'MANUAL',
      hostParticipates: true,
      announceLeadSeconds: 60,
      runnerShareIntervalSeconds: 90,
      violationGraceSeconds: 60,
      catchVerificationMode: 'RUNNER_OR_HOST',
      obfuscationGridM: 60,
      locationLossThresholdSeconds: 90,
      autoEliminateOnLocationLoss: false,
      requireAllReady: false,
    },
    rounds,
  });

  // Link game to party
  await query(
    `UPDATE games SET party_id = $1 WHERE id = $2`,
    [partyId, createdGame.id]
  );
  await query(
    `UPDATE parties SET active_match_id = $1, updated_at = NOW() WHERE id = $2`,
    [createdGame.id, partyId]
  );

  // Set perimeter in store
  gamesService.setGamePerimeter(createdGame.id, {
    shape: matchConfig.boundaryShape || 'CIRCLE',
    rectWidthMeters: matchConfig.rectWidthMeters || 600,
    rectHeightMeters: matchConfig.rectHeightMeters || 600,
    rectRotationDeg: matchConfig.rectRotationDeg || 0,
    polygonPoints: matchConfig.polygonPoints || [],
    revealSeekersOnMap: party.revealSeekersOnMap,
  });

  // Snapshot freeze: insert all active party members into game_players
  let seekerCount = 0;
  let runnerCount = 0;
  for (const m of activeMembers) {
    let finalRole: PlayerRole = m.role;
    if (finalRole === PlayerRole.HOST) {
      finalRole = PlayerRole.SEEKER;
    }
    if (finalRole === PlayerRole.SEEKER) seekerCount++;
    if (finalRole === PlayerRole.RUNNER) runnerCount++;

    await query(
      `INSERT INTO game_players (game_id, user_id, role, status, is_ready, connected, location_consent_at)
       VALUES ($1, $2, $3, 'ACTIVE', true, true, NOW())
       ON CONFLICT (game_id, user_id) DO UPDATE
         SET role = EXCLUDED.role, status = 'ACTIVE', connected = true`,
      [createdGame.id, m.userId, finalRole]
    );
  }

  // Ensure team balance if multi-player
  if (activeMembers.length >= 2) {
    if (seekerCount === 0) {
      await query(
        `UPDATE game_players SET role = 'SEEKER' WHERE game_id = $1 AND user_id = $2`,
        [createdGame.id, hostUserId]
      );
    } else if (runnerCount === 0) {
      const nonHost = activeMembers.find((m) => m.userId !== hostUserId);
      if (nonHost) {
        await query(
          `UPDATE game_players SET role = 'RUNNER' WHERE game_id = $1 AND user_id = $2`,
          [createdGame.id, nonHost.userId]
        );
      }
    }
  }

  // Authoritatively activate match session via Game Engine
  try {
    await engineService.startGame(hostUserId, createdGame.id);
  } catch {
    // If strict multi-round start prerequisites weren't met (e.g. solo run), mark ACTIVE directly
    await query(
      `UPDATE games
       SET status = 'ACTIVE',
           started_at = NOW(),
           round_ends_at = NOW() + ($2 || ' minutes')::interval,
           ends_at = NOW() + ($3 || ' minutes')::interval
       WHERE id = $1`,
      [
        createdGame.id,
        String(matchConfig.roundDurationMinutes || 15),
        String((matchConfig.roundDurationMinutes || 15) * (matchConfig.totalRounds || 1)),
      ]
    );
  }

  await postAnnouncement(
    partyId,
    null,
    `🚀 MATCH LAUNCHED! Code: ${createdGame.roomCode}. All squad members transitioning to tactical airspace.`,
    'SYSTEM'
  );

  // Broadcast transition event to all party members
  emitToParty(partyId, SocketEvent.PARTY_MATCH_STARTED, {
    partyId,
    matchId: createdGame.id,
    roomCode: createdGame.roomCode,
    startsAt: new Date().toISOString(),
  });

  return { matchId: createdGame.id, roomCode: createdGame.roomCode };
}

// ── Chat and Announcements ──────────────────────────────────────────────────

export async function resolvePartyId(targetId: string): Promise<string> {
  if (!targetId) return targetId;

  try {
    // 1. Check if targetId is an existing party
    const { rows: partyRows } = await query<{ id: string }>(
      'SELECT id FROM parties WHERE id = $1',
      [targetId]
    );
    if (partyRows[0]) return partyRows[0].id;

    // 2. Check if a party has active_match_id = targetId
    const { rows: linkedPartyRows } = await query<{ id: string }>(
      'SELECT id FROM parties WHERE active_match_id = $1 LIMIT 1',
      [targetId]
    );
    if (linkedPartyRows[0]) return linkedPartyRows[0].id;

    // 3. Check if targetId is an existing game
    const { rows: gameRows } = await query<{ id: string; host_user_id: string; room_code: string }>(
      'SELECT id, host_user_id, room_code FROM games WHERE id = $1',
      [targetId]
    );
    if (gameRows[0]) {
      const g = gameRows[0];
      const { rows: createdParty } = await query<{ id: string }>(
        `INSERT INTO parties (
           party_code, leader_user_id, status, max_members,
           lock_when_match_starts, reveal_seekers_on_map, active_match_id, settings
         ) VALUES ($1, $2, 'OPEN', 16, false, true, $3, '{}')
         ON CONFLICT (party_code) DO UPDATE SET active_match_id = EXCLUDED.active_match_id
         RETURNING id`,
        [g.room_code, g.host_user_id, g.id]
      );
      if (createdParty[0]) {
        return createdParty[0].id;
      }
    }
  } catch {
    // If targetId is not a valid UUID or DB query fails, fallback
  }

  return targetId;
}

export async function postChatMessage(
  partyId: string,
  userId: string,
  message: string,
  matchId?: string
): Promise<PartyChatMessage> {
  const cleanMessage = message.trim();
  if (!cleanMessage || cleanMessage.length > 500) {
    throw new AppError('BAD_REQUEST', 'Message must be between 1 and 500 characters.', 400);
  }

  const resolvedId = await resolvePartyId(partyId);
  const effectiveMatchId = matchId || (partyId !== resolvedId ? partyId : null);

  const { rows } = await query<{
    id: string;
    party_id: string;
    match_id: string | null;
    sender_user_id: string;
    message: string;
    created_at: Date;
    display_name: string;
    avatar_url: string | null;
    role: PlayerRole;
  }>(
    `WITH inserted AS (
       INSERT INTO party_chat_messages (party_id, match_id, sender_user_id, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *
     )
     SELECT i.id, i.party_id, i.match_id, i.sender_user_id, i.message, i.created_at,
            u.display_name, u.avatar_url, COALESCE(pm.role, gp.role, 'RUNNER') AS role
     FROM inserted i
     JOIN users u ON u.id = i.sender_user_id
     LEFT JOIN party_members pm ON pm.party_id = i.party_id AND pm.user_id = i.sender_user_id
     LEFT JOIN game_players gp ON gp.game_id = i.match_id AND gp.user_id = i.sender_user_id`,
    [resolvedId, effectiveMatchId, userId, cleanMessage]
  );

  const row = rows[0]!;
  const chatMsg: PartyChatMessage = {
    id: row.id,
    partyId: partyId,
    matchId: row.match_id,
    senderUserId: row.sender_user_id,
    senderDisplayName: row.display_name,
    senderAvatarUrl: row.avatar_url,
    senderRole: row.role,
    message: row.message,
    createdAt: row.created_at.toISOString(),
  };

  emitToParty(resolvedId, SocketEvent.PARTY_CHAT_MESSAGE, chatMsg);
  if (partyId !== resolvedId) {
    emitToParty(partyId, SocketEvent.PARTY_CHAT_MESSAGE, chatMsg);
  }
  if (effectiveMatchId) {
    emitToGame(effectiveMatchId, SocketEvent.PARTY_CHAT_MESSAGE, chatMsg);
  }
  return chatMsg;
}

export async function getChatHistory(partyId: string, limit = 50): Promise<PartyChatMessage[]> {
  const resolvedId = await resolvePartyId(partyId);
  const { rows } = await query<{
    id: string;
    party_id: string;
    match_id: string | null;
    sender_user_id: string;
    message: string;
    created_at: Date;
    display_name: string;
    avatar_url: string | null;
    role: PlayerRole;
  }>(
    `SELECT cm.id, cm.party_id, cm.match_id, cm.sender_user_id, cm.message, cm.created_at,
            u.display_name, u.avatar_url, COALESCE(pm.role, gp.role, 'RUNNER') as role
     FROM party_chat_messages cm
     JOIN users u ON u.id = cm.sender_user_id
     LEFT JOIN party_members pm ON pm.party_id = cm.party_id AND pm.user_id = cm.sender_user_id
     LEFT JOIN game_players gp ON gp.game_id = cm.match_id AND gp.user_id = cm.sender_user_id
     WHERE cm.party_id = $1 OR cm.match_id = $2 OR cm.party_id = $2
     ORDER BY cm.created_at ASC
     LIMIT $3`,
    [resolvedId, partyId, limit]
  );

  return rows.map((r) => ({
    id: r.id,
    partyId: partyId,
    matchId: r.match_id,
    senderUserId: r.sender_user_id,
    senderDisplayName: r.display_name,
    senderAvatarUrl: r.avatar_url,
    senderRole: r.role,
    message: r.message,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function postAnnouncement(
  partyId: string,
  senderUserId: string | null,
  message: string,
  type: 'SYSTEM' | 'HOST' | 'EVENT' | 'WARNING' | 'ELIMINATION' = 'SYSTEM',
  metadata: Record<string, any> = {},
  matchId?: string
): Promise<PartyAnnouncement> {
  const resolvedId = await resolvePartyId(partyId);
  const effectiveMatchId = matchId || (partyId !== resolvedId ? partyId : null);

  const { rows } = await query<{
    id: string;
    party_id: string;
    match_id: string | null;
    sender_user_id: string | null;
    announcement_type: string;
    message: string;
    metadata: any;
    created_at: Date;
    display_name: string | null;
  }>(
    `WITH inserted AS (
       INSERT INTO party_announcements (party_id, match_id, sender_user_id, announcement_type, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *
     )
     SELECT i.*, u.display_name
     FROM inserted i
     LEFT JOIN users u ON u.id = i.sender_user_id`,
    [resolvedId, effectiveMatchId, senderUserId || null, type, message, JSON.stringify(metadata)]
  );

  const row = rows[0]!;
  const announcement: PartyAnnouncement = {
    id: row.id,
    partyId: partyId,
    matchId: row.match_id,
    senderUserId: row.sender_user_id,
    senderDisplayName: row.display_name,
    announcementType: row.announcement_type as any,
    message: row.message,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  };

  emitToParty(resolvedId, SocketEvent.PARTY_ANNOUNCEMENT, announcement);
  if (partyId !== resolvedId) {
    emitToParty(partyId, SocketEvent.PARTY_ANNOUNCEMENT, announcement);
  }
  if (effectiveMatchId) {
    emitToGame(effectiveMatchId, SocketEvent.PARTY_ANNOUNCEMENT, announcement);
  }
  return announcement;
}

export async function getAnnouncements(partyId: string, limit = 50): Promise<PartyAnnouncement[]> {
  const resolvedId = await resolvePartyId(partyId);
  const { rows } = await query<{
    id: string;
    party_id: string;
    match_id: string | null;
    sender_user_id: string | null;
    announcement_type: string;
    message: string;
    metadata: any;
    created_at: Date;
    display_name: string | null;
  }>(
    `SELECT pa.*, u.display_name
     FROM party_announcements pa
     LEFT JOIN users u ON u.id = pa.sender_user_id
     WHERE pa.party_id = $1 OR pa.match_id = $2 OR pa.party_id = $2
     ORDER BY pa.created_at ASC
     LIMIT $3`,
    [resolvedId, partyId, limit]
  );

  return rows.map((r) => ({
    id: r.id,
    partyId: partyId,
    matchId: r.match_id,
    senderUserId: r.sender_user_id,
    senderDisplayName: r.display_name,
    announcementType: r.announcement_type as any,
    message: r.message,
    metadata: r.metadata,
    createdAt: r.created_at.toISOString(),
  }));
}
