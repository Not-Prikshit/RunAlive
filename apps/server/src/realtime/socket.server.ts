// apps/server/src/realtime/socket.server.ts
// Socket.IO server setup — authentication middleware, room management

import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { verifyAccessToken } from '../modules/auth/auth.service.js';
import { query } from '../db/pool.js';

export interface AuthenticatedSocket extends Socket {
  userId: string;
  displayName: string;
}

export let io: SocketServer | undefined;

export function createSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || config.NODE_ENV !== 'production') {
          callback(null, true);
        } else {
          const allowed = config.CORS_ORIGINS.split(',').map((o) => o.trim());
          callback(null, allowed.includes(origin));
        }
      },
      credentials: true,
    },
    pingTimeout: 20_000,
    pingInterval: 10_000,
  });

  // ── Authentication middleware ──────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: string }).token;
      if (!token) {
        return next(new Error('UNAUTHORIZED: missing token'));
      }
      const payload = await verifyAccessToken(token);
      const authSocket = socket as unknown as AuthenticatedSocket;
      authSocket.userId = payload.sub as string;
      authSocket.displayName = payload.displayName as string;
      next();
    } catch {
      next(new Error('UNAUTHORIZED: invalid token'));
    }
  });

  // ── Connection handler ────────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    const s = socket as unknown as AuthenticatedSocket;
    logger.debug({ userId: s.userId }, 'Socket connected');

    // Auto-join personal room
    void socket.join(`user:${s.userId}`);

    // Re-join active game rooms if player is in a game
    try {
      const { rows } = await query<{ game_id: string; role: string }>(
        `SELECT gp.game_id, gp.role
         FROM game_players gp
         JOIN games g ON g.id = gp.game_id
         WHERE gp.user_id = $1
           AND gp.status NOT IN ('LEFT', 'KICKED')
           AND g.status NOT IN ('FINISHED', 'CANCELLED')`,
        [s.userId]
      );
      for (const row of rows) {
        void socket.join(`game:${row.game_id}`);
        if (row.role === 'RUNNER') void socket.join(`game:${row.game_id}:runners`);
        if (row.role === 'SEEKER') void socket.join(`game:${row.game_id}:seekers`);
        await query(
          `UPDATE game_players SET connected = true, last_seen_at = NOW()
           WHERE user_id = $1 AND game_id = $2`,
          [s.userId, row.game_id]
        );
      }
    } catch (err) {
      logger.error({ err, userId: s.userId }, 'Error re-joining game rooms');
    }

    socket.on('disconnect', async (reason) => {
      logger.debug({ userId: s.userId, reason }, 'Socket disconnected');
      try {
        await query(
          `UPDATE game_players SET connected = false, last_seen_at = NOW()
           WHERE user_id = $1
             AND status NOT IN ('LEFT', 'KICKED')`,
          [s.userId]
        );
      } catch (err) {
        logger.error({ err }, 'Error updating disconnect status');
      }
    });

    // game:sync handler
    socket.on('game:sync', async (_payload: { knownStateVersion: number; gameId: string }, ack) => {
      try {
        typeof ack === 'function' && ack({ ok: true });
      } catch {
        typeof ack === 'function' && ack({ ok: false, error: { code: 'SYNC_ERROR', message: 'Sync failed' } });
      }
    });
  });

  return io;
}

export function emitToGame<T>(gameId: string, event: string, data: T): void {
  if (io) {
    io.to(`game:${gameId}`).emit(event, data);
  }
}

export function emitToRunners<T>(gameId: string, event: string, data: T): void {
  if (io) {
    io.to(`game:${gameId}:runners`).emit(event, data);
  }
}

export function emitToSeekers<T>(gameId: string, event: string, data: T): void {
  if (io) {
    io.to(`game:${gameId}:seekers`).emit(event, data);
  }
}

export function emitToUser<T>(userId: string, event: string, data: T): void {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}
