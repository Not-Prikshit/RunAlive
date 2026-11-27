// apps/server/src/multiplayer/rooms/RunAliveRoom.ts
import { Room, Client, ServerError, CloseCode } from '@colyseus/core';
import crypto from 'node:crypto';
import {
  GameRoomState,
  PlayerState,
  ChatMessageState,
} from '../schema/GameRoomState.js';
import { verifyAccessToken } from '../../modules/auth/auth.service.js';
import { query } from '../../db/pool.js';
import { logger } from '../../logger.js';
import { haversineDistanceM } from '../../modules/locations/locations.service.js';
import { calculateEffectiveDistance, computeNextDangerBand } from '../../modules/danger/danger.service.js';
import {
  GameStatus,
  LocationFreshness,
  LocationRefreshTier,
  DangerBand,
} from '@runalive/shared';

export interface RoomAuthData {
  userId: string;
  displayName: string;
}

export interface BufferedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number;
  speed: number;
  timestamp: number;
  receivedAt: number;
}

export class RunAliveRoom extends Room<{ state: GameRoomState }> {
  override maxClients = 50;

  // Buffered locations held in memory until the host-configured broadcast interval tick
  private bufferedLocations = new Map<string, BufferedLocation>();
  private clientUserMap = new Map<string, string>(); // client.sessionId -> userId
  private userClientMap = new Map<string, Client>(); // userId -> client
  private countdownSeconds = 5;

  override onCreate(options: {
    sessionId?: string;
    gameId?: string;
    joinCode?: string;
    name?: string;
    durationMinutes?: number;
    locationRefreshIntervalSec?: number;
    locationRefreshTier?: string;
    centerLat?: number;
    centerLng?: number;
    radiusMeters?: number;
  }) {
    this.setState(new GameRoomState());

    const sessionId = options.sessionId || options.gameId || this.roomId;
    this.state.sessionId = sessionId;
    this.state.joinCode = options.joinCode || this.generateJoinCode();
    this.state.sessionName = options.name || 'RunAlive Session';
    this.state.durationMinutes = options.durationMinutes || 15;
    this.state.timeRemainingSec = this.state.durationMinutes * 60;

    const interval = options.locationRefreshIntervalSec || 10;
    this.state.locationRefreshIntervalSec = Math.max(3, Math.min(60, interval));
    this.state.locationRefreshTier = options.locationRefreshTier || 'NORMAL';
    this.state.nextLocationBroadcastTime = Date.now() + this.state.locationRefreshIntervalSec * 1000;

    if (options.centerLat && options.centerLng) {
      this.state.perimeter.centerLat = options.centerLat;
      this.state.perimeter.centerLng = options.centerLng;
      this.state.perimeter.currentRadius = options.radiusMeters || 500;
      this.state.perimeter.targetRadius = options.radiusMeters || 500;
    }

    this.setupMessageHandlers();

    // 1-second authoritative simulation tick
    this.setSimulationInterval((deltaTime) => this.onSimulationTick(deltaTime), 1000);

    logger.info(
      { roomId: this.roomId, sessionId: this.state.sessionId, joinCode: this.state.joinCode },
      '🎮 Colyseus RunAliveRoom created'
    );
  }

  override async onAuth(
    _client: Client,
    options: { token?: string; userId?: string; displayName?: string }
  ): Promise<RoomAuthData> {
    if (options.token) {
      try {
        const payload = await verifyAccessToken(options.token);
        return {
          userId: payload.sub as string,
          displayName: (payload.displayName as string) || 'Operative',
        };
      } catch (err) {
        logger.warn({ err }, 'Colyseus onAuth failed: invalid token');
        throw new ServerError(401, 'UNAUTHORIZED: invalid token');
      }
    }

    if (process.env.NODE_ENV !== 'production' && options.userId) {
      return {
        userId: options.userId,
        displayName: options.displayName || 'Test Player',
      };
    }

    throw new ServerError(401, 'UNAUTHORIZED: missing authentication token');
  }

  override async onJoin(
    client: Client,
    options: { role?: string; isHost?: boolean },
    auth: RoomAuthData
  ) {
    const userId = auth.userId;
    this.clientUserMap.set(client.sessionId, userId);
    this.userClientMap.set(userId, client);

    let player = this.state.players.get(userId);

    if (player) {
      // Reconnection of an existing player
      player.isConnected = true;
      player.location.freshness = LocationFreshness.LIVE;
      player.lastSeenAt = Date.now();
      logger.info({ userId, roomId: this.roomId }, 'Player reconnected to room');
    } else {
      // New player joining the room
      if (this.state.status === GameStatus.FINISHED || this.state.status === GameStatus.CANCELLED) {
        throw new ServerError(400, 'Cannot join a completed game');
      }

      player = new PlayerState();
      player.id = userId;
      player.displayName = auth.displayName;
      player.isConnected = true;
      player.status = 'ACTIVE';

      // First player or specified host
      const isFirst = this.state.players.size === 0;
      if (isFirst || options.isHost || !this.state.hostId) {
        this.state.hostId = userId;
        player.isHost = true;
        player.role = options.role || 'HOST';
      } else {
        player.role = options.role || (this.state.players.size % 2 === 0 ? 'SEEKER' : 'RUNNER');
      }

      this.state.players.set(userId, player);
      logger.info({ userId, role: player.role, isHost: player.isHost }, 'Player joined Colyseus room');
    }

    // Persist to PostgreSQL to keep DB synchronized
    try {
      await query(
        `INSERT INTO game_players (game_id, user_id, role, status, connected, last_seen_at)
         VALUES ($1, $2, $3, $4, true, NOW())
         ON CONFLICT (game_id, user_id)
         DO UPDATE SET connected = true, last_seen_at = NOW(), role = EXCLUDED.role`,
        [this.state.sessionId, userId, player.role, player.status]
      );
    } catch (err) {
      logger.error({ err, userId }, 'Error upserting game_player in database');
    }

    this.broadcastSystemMessage(`${auth.displayName} joined the lobby.`);
  }

  override async onLeave(client: Client, code?: number) {
    const userId = this.clientUserMap.get(client.sessionId);
    if (!userId) return;

    this.clientUserMap.delete(client.sessionId);
    const player = this.state.players.get(userId);

    if (!player) return;

    const consented = code === CloseCode.CONSENTED || code === 1000;

    if (consented) {
      // Intentional leave
      player.isConnected = false;
      player.status = 'LEFT';
      player.location.freshness = LocationFreshness.OFFLINE;
      this.userClientMap.delete(userId);
      this.handleHostMigration(userId);
      logger.info({ userId }, 'Player left room consented');
    } else {
      // Unintentional disconnect / transient connection drop
      player.isConnected = false;
      player.location.freshness = LocationFreshness.OFFLINE;
      logger.info({ userId }, 'Player disconnected (allowing 30s reconnection)');

      try {
        await this.allowReconnection(client, 30);
        // Reconnected successfully
        player.isConnected = true;
        player.location.freshness = LocationFreshness.LIVE;
        this.clientUserMap.set(client.sessionId, userId);
        this.userClientMap.set(userId, client);
        logger.info({ userId }, 'Player successfully reconnected');
      } catch {
        // Reconnection timed out after 30 seconds
        player.isConnected = false;
        player.location.freshness = LocationFreshness.OFFLINE;
        this.userClientMap.delete(userId);
        this.handleHostMigration(userId);
        logger.info({ userId }, 'Player reconnection timed out');
      }
    }

    try {
      await query(
        `UPDATE game_players SET connected = false, last_seen_at = NOW() WHERE game_id = $1 AND user_id = $2`,
        [this.state.sessionId, userId]
      );
    } catch {}
  }

  override onDispose() {
    logger.info({ roomId: this.roomId, sessionId: this.state.sessionId }, 'Disposing RunAliveRoom');
  }

  // ── Authoritative Simulation Tick (1000ms) ──────────────────────────────────
  private onSimulationTick(_deltaTime: number) {
    const now = Date.now();

    // 1. Host-Controlled Location Refresh Tick
    if (now >= this.state.nextLocationBroadcastTime) {
      this.flushBufferedLocations(now);
      this.state.nextLocationBroadcastTime = now + this.state.locationRefreshIntervalSec * 1000;
    }

    // 2. State Machine Transitions
    if (this.state.status === GameStatus.COUNTDOWN) {
      this.countdownSeconds--;
      if (this.countdownSeconds <= 0) {
        this.state.status = GameStatus.ACTIVE;
        this.state.startedAt = now;
        this.broadcastSystemMessage('🚨 Match has begun! Run for your lives!');
      }
    } else if (this.state.status === GameStatus.ACTIVE) {
      // Match Timer
      if (this.state.timeRemainingSec > 0) {
        this.state.timeRemainingSec--;
        if (this.state.timeRemainingSec <= 0) {
          this.evaluateTimeExpiredVictory();
        }
      }

      // Perimeter Shrinking
      if (this.state.perimeter.isShrinking) {
        this.stepPerimeterShrink(now);
      }

      // Danger Meter & Proximity Engine
      this.evaluateDangerMeters(now);
    }
  }

  // ── Host-Controlled Location Intelligence ───────────────────────────────────
  private flushBufferedLocations(now: number) {
    for (const [userId, player] of this.state.players.entries()) {
      const buffered = this.bufferedLocations.get(userId);

      if (buffered) {
        player.location.latitude = buffered.latitude;
        player.location.longitude = buffered.longitude;
        player.location.accuracy = buffered.accuracy;
        player.location.heading = buffered.heading;
        player.location.speed = buffered.speed;
        player.location.timestamp = buffered.timestamp;
        player.location.lastUpdatedAt = now;

        const ageMs = now - buffered.receivedAt;
        if (!player.isConnected) {
          player.location.freshness = LocationFreshness.OFFLINE;
        } else if (ageMs <= this.state.locationRefreshIntervalSec * 1000 + 5000) {
          player.location.freshness = LocationFreshness.LIVE;
        } else if (ageMs <= this.state.locationRefreshIntervalSec * 2000) {
          player.location.freshness = LocationFreshness.UPDATING;
        } else {
          player.location.freshness = LocationFreshness.STALE;
        }
      } else {
        if (!player.isConnected) {
          player.location.freshness = LocationFreshness.OFFLINE;
        } else if (player.location.latitude === 0 && player.location.longitude === 0) {
          player.location.freshness = LocationFreshness.OFFLINE;
        } else {
          player.location.freshness = LocationFreshness.STALE;
        }
      }
    }
  }

  // ── Proximity & Danger Meter Engine ─────────────────────────────────────────
  private evaluateDangerMeters(now: number) {
    const seekers: PlayerState[] = [];
    const runners: PlayerState[] = [];

    for (const player of this.state.players.values()) {
      if (!player.isConnected || player.status !== 'ACTIVE') continue;
      if (player.role === 'SEEKER') seekers.push(player);
      if (player.role === 'RUNNER' || player.role === 'HIDER') runners.push(player);
    }

    if (seekers.length === 0 || runners.length === 0) return;

    for (const runner of runners) {
      if (runner.location.latitude === 0 && runner.location.longitude === 0) continue;

      let minDistance = 99999;
      let nearestSeekerId = '';

      for (const seeker of seekers) {
        if (seeker.location.latitude === 0 && seeker.location.longitude === 0) continue;

        const effDist = calculateEffectiveDistance(
          { lat: runner.location.latitude, lon: runner.location.longitude, accuracyM: runner.location.accuracy },
          { lat: seeker.location.latitude, lon: seeker.location.longitude, accuracyM: seeker.location.accuracy }
        );

        if (effDist < minDistance) {
          minDistance = effDist;
          nearestSeekerId = seeker.id;
        }
      }

      runner.danger.effectiveDistance = Math.round(minDistance);
      runner.danger.nearestOpponentId = nearestSeekerId;
      runner.danger.updatedAt = now;

      // Band classification
      const nextBand = computeNextDangerBand(runner.danger.band as DangerBand, minDistance);
      runner.danger.band = nextBand;

      // Calculate haptic & audio pulse frequency
      if (minDistance <= 20) {
        runner.danger.pulseFrequencyHz = 8.0;
        runner.danger.vibrationPattern = 'CRITICAL';
      } else if (minDistance <= 50) {
        runner.danger.pulseFrequencyHz = 4.0;
        runner.danger.vibrationPattern = 'DANGER';
      } else if (minDistance <= 100) {
        runner.danger.pulseFrequencyHz = 2.0;
        runner.danger.vibrationPattern = 'WARNING';
      } else if (minDistance <= 200) {
        runner.danger.pulseFrequencyHz = 1.0;
        runner.danger.vibrationPattern = 'ELEVATED';
      } else {
        runner.danger.pulseFrequencyHz = 0.5;
        runner.danger.vibrationPattern = 'NONE';
      }
    }
  }

  // ── Safe-Zone Perimeter Shrinking ───────────────────────────────────────────
  private stepPerimeterShrink(_now: number) {
    const p = this.state.perimeter;
    if (p.currentRadius > p.targetRadius) {
      const step = Math.max(1, (p.currentRadius - p.targetRadius) / 60);
      p.currentRadius = Math.max(p.targetRadius, p.currentRadius - step);
      if (p.currentRadius <= p.targetRadius) {
        p.isShrinking = false;
        this.broadcastSystemMessage(`🛡️ Safe-zone reached ${Math.round(p.targetRadius)}m radius.`);
      }
    }
  }

  // ── Match End Evaluation ───────────────────────────────────────────────────
  private evaluateTimeExpiredVictory() {
    let aliveRunners = 0;
    for (const player of this.state.players.values()) {
      if ((player.role === 'RUNNER' || player.role === 'HIDER') && player.status === 'ACTIVE') {
        aliveRunners++;
      }
    }

    if (aliveRunners > 0) {
      this.finishMatch('RUNNERS', 'Time expired! Runners successfully survived.');
    } else {
      this.finishMatch('SEEKERS', 'Time expired! All runners eliminated.');
    }
  }

  private finishMatch(winner: string, reason: string) {
    this.state.status = GameStatus.FINISHED;
    this.state.winner = winner;
    this.state.endedAt = Date.now();
    this.broadcastSystemMessage(`🏆 Match over: ${reason}`);

    void query(
      `UPDATE games SET status = 'FINISHED', winner = $1, ends_at = NOW() WHERE id = $2`,
      [winner, this.state.sessionId]
    ).catch(() => {});
  }

  // ── Message Handlers ────────────────────────────────────────────────────────
  private setupMessageHandlers() {
    // 1. Host settings update
    this.onMessage('host:update_settings', (client, data: {
      locationRefreshIntervalSec?: number;
      durationMinutes?: number;
      sessionName?: string;
      centerLat?: number;
      centerLng?: number;
      radiusMeters?: number;
    }) => {
      const userId = this.clientUserMap.get(client.sessionId);
      if (userId !== this.state.hostId) {
        throw new ServerError(403, 'Only host can change game settings');
      }

      if (data.locationRefreshIntervalSec !== undefined) {
        const sec = Math.max(3, Math.min(60, data.locationRefreshIntervalSec));
        this.state.locationRefreshIntervalSec = sec;
        if (sec === 3) this.state.locationRefreshTier = 'EASY';
        else if (sec === 10) this.state.locationRefreshTier = 'NORMAL';
        else if (sec === 20) this.state.locationRefreshTier = 'HARD';
        else if (sec === 30) this.state.locationRefreshTier = 'EXTREME';
        else this.state.locationRefreshTier = 'CUSTOM';

        this.broadcastSystemMessage(`📡 Location refresh interval updated to ${sec}s.`);
      }

      if (data.durationMinutes !== undefined) {
        this.state.durationMinutes = data.durationMinutes;
        this.state.timeRemainingSec = data.durationMinutes * 60;
      }

      if (data.sessionName) {
        this.state.sessionName = data.sessionName;
      }

      if (data.centerLat && data.centerLng && data.radiusMeters) {
        this.state.perimeter.centerLat = data.centerLat;
        this.state.perimeter.centerLng = data.centerLng;
        this.state.perimeter.currentRadius = data.radiusMeters;
        this.state.perimeter.targetRadius = data.radiusMeters;
      }
    });

    // 2. Host role assignment / team change
    this.onMessage('host:set_player_role', (client, data: { targetUserId: string; role: string }) => {
      const userId = this.clientUserMap.get(client.sessionId);
      if (userId !== this.state.hostId) {
        throw new ServerError(403, 'Only host can assign roles');
      }
      if (this.state.status === GameStatus.ACTIVE) {
        throw new ServerError(400, 'Cannot change roles while game is active');
      }

      const target = this.state.players.get(data.targetUserId);
      if (target) {
        target.role = data.role === 'SEEKER' ? 'SEEKER' : 'RUNNER';
        this.broadcastSystemMessage(`${target.displayName} reassigned to ${target.role}s.`);
      }
    });

    // 3. Host match start
    this.onMessage('host:start_match', (client) => {
      const userId = this.clientUserMap.get(client.sessionId);
      if (userId !== this.state.hostId) {
        throw new ServerError(403, 'Only host can start the match');
      }

      if (this.state.status !== GameStatus.LOBBY && this.state.status !== GameStatus.PLANNING) {
        throw new ServerError(400, 'Game is not in lobby state');
      }

      this.state.status = GameStatus.COUNTDOWN;
      this.countdownSeconds = 5;
      this.broadcastSystemMessage('⏱️ Match starting in 5 seconds...');
    });

    // 4. Host pause & resume
    this.onMessage('host:pause_match', (client) => {
      const userId = this.clientUserMap.get(client.sessionId);
      if (userId !== this.state.hostId) return;
      if (this.state.status === GameStatus.ACTIVE) {
        this.state.status = GameStatus.PAUSED;
        this.broadcastSystemMessage('⏸️ Match paused by host.');
      }
    });

    this.onMessage('host:resume_match', (client) => {
      const userId = this.clientUserMap.get(client.sessionId);
      if (userId !== this.state.hostId) return;
      if (this.state.status === GameStatus.PAUSED) {
        this.state.status = GameStatus.ACTIVE;
        this.broadcastSystemMessage('▶️ Match resumed.');
      }
    });

    // 5. Host end match
    this.onMessage('host:end_match', (client) => {
      const userId = this.clientUserMap.get(client.sessionId);
      if (userId !== this.state.hostId) return;
      this.finishMatch('DRAW', 'Match ended early by host.');
    });

    // 6. Player ready toggle
    this.onMessage('player:ready', (client, data: { ready?: boolean }) => {
      const userId = this.clientUserMap.get(client.sessionId);
      if (!userId) return;
      const player = this.state.players.get(userId);
      if (player) {
        player.isReady = data?.ready !== undefined ? data.ready : !player.isReady;
      }
    });

    // 7. Player location update
    this.onMessage('player:location_update', (client, data: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      heading?: number;
      speed?: number;
      timestamp?: number;
    }) => {
      const userId = this.clientUserMap.get(client.sessionId);
      if (!userId) return;

      if (
        typeof data.latitude !== 'number' ||
        typeof data.longitude !== 'number' ||
        data.latitude < -90 ||
        data.latitude > 90 ||
        data.longitude < -180 ||
        data.longitude > 180
      ) {
        return;
      }

      this.bufferedLocations.set(userId, {
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy || 10,
        heading: data.heading || 0,
        speed: data.speed || 0,
        timestamp: data.timestamp || Date.now(),
        receivedAt: Date.now(),
      });

      const player = this.state.players.get(userId);
      if (player) {
        player.lastSeenAt = Date.now();
      }
    });

    // 8. Chat message
    this.onMessage('chat:send', (client, data: { message: string; targetRole?: string }) => {
      const userId = this.clientUserMap.get(client.sessionId);
      if (!userId) return;
      const player = this.state.players.get(userId);
      if (!player) return;

      const trimmed = data.message?.trim();
      if (!trimmed) return;

      const msg = new ChatMessageState();
      msg.id = crypto.randomUUID();
      msg.senderId = userId;
      msg.senderName = player.displayName;
      msg.senderRole = player.role;
      msg.message = trimmed.slice(0, 500);
      msg.timestamp = Date.now();
      msg.targetRole = data.targetRole || 'ALL';

      this.state.messages.push(msg);
      if (this.state.messages.length > 50) {
        this.state.messages.shift();
      }

      // Persist asynchronously
      void query(
        `INSERT INTO party_chat_messages (id, party_id, user_id, message, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [msg.id, this.state.sessionId, userId, msg.message]
      ).catch(() => {});
    });

    // 9. Host priority announcement
    this.onMessage('host:announcement', (client, data: { title: string; body: string }) => {
      const userId = this.clientUserMap.get(client.sessionId);
      if (!userId || userId !== this.state.hostId) return;

      const msg = new ChatMessageState();
      msg.id = crypto.randomUUID();
      msg.senderId = userId;
      msg.senderName = 'HOST ANNOUNCEMENT';
      msg.senderRole = 'HOST';
      msg.message = `${data.title ? data.title + ': ' : ''}${data.body}`;
      msg.timestamp = Date.now();
      msg.isAnnouncement = true;

      this.state.messages.push(msg);
    });

    // 10. Catch claim / verification
    this.onMessage('catch:claim', (client, data: { targetRunnerId: string }) => {
      const seekerId = this.clientUserMap.get(client.sessionId);
      if (!seekerId) return;
      const seeker = this.state.players.get(seekerId);
      const runner = this.state.players.get(data.targetRunnerId);

      if (!seeker || !runner || seeker.role !== 'SEEKER' || runner.status !== 'ACTIVE') {
        return;
      }

      const dist = haversineDistanceM(
        seeker.location.latitude,
        seeker.location.longitude,
        runner.location.latitude,
        runner.location.longitude
      );

      // Verify catch proximity (< 15 meters)
      if (dist <= 15) {
        runner.status = 'CAUGHT';
        runner.danger.band = DangerBand.CAUGHT;
        this.broadcastSystemMessage(`🎯 ${runner.displayName} was caught by ${seeker.displayName}!`);

        // Check if all runners caught
        let remainingRunners = 0;
        for (const p of this.state.players.values()) {
          if ((p.role === 'RUNNER' || p.role === 'HIDER') && p.status === 'ACTIVE') {
            remainingRunners++;
          }
        }

        if (remainingRunners === 0) {
          this.finishMatch('SEEKERS', 'All runners have been caught!');
        }
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private broadcastSystemMessage(text: string) {
    const msg = new ChatMessageState();
    msg.id = crypto.randomUUID();
    msg.senderId = 'SYSTEM';
    msg.senderName = 'RunAlive Command';
    msg.senderRole = 'SYSTEM';
    msg.message = text;
    msg.timestamp = Date.now();
    msg.isSystem = true;

    this.state.messages.push(msg);
    if (this.state.messages.length > 50) {
      this.state.messages.shift();
    }
  }

  private handleHostMigration(leavingUserId: string) {
    if (this.state.hostId === leavingUserId) {
      for (const player of this.state.players.values()) {
        if (player.isConnected && player.id !== leavingUserId) {
          this.state.hostId = player.id;
          player.isHost = true;
          this.broadcastSystemMessage(`👑 ${player.displayName} is now the host.`);
          break;
        }
      }
    }
  }

  private generateJoinCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'RUN-';
    const bytes = crypto.randomBytes(5);
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(bytes[i]! % chars.length);
    }
    return code;
  }
}
