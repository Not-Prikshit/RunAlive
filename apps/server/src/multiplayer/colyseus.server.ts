// apps/server/src/multiplayer/colyseus.server.ts
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import type { Server as HttpServer } from 'http';
import { RunAliveRoom } from './rooms/RunAliveRoom.js';
import { logger } from '../logger.js';

export let colyseusServer: Server | undefined;

export function createColyseusServer(httpServer: HttpServer): Server {
  const transport = new WebSocketTransport({ noServer: true });

  // Attach to the shared HTTP server, skipping Socket.IO upgrades so both coexist seamlessly
  transport.attachToServer(httpServer, {
    filter: (req) => !req.url?.startsWith('/socket.io'),
  });

  colyseusServer = new Server({
    transport,
  });

  colyseusServer.define('runalive_game', RunAliveRoom)
    .enableRealtimeListing();

  logger.info('🕹️ Colyseus authoritative game engine attached to HTTP server');
  return colyseusServer;
}
