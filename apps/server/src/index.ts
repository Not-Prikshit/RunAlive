// apps/server/src/index.ts
// Entry point: creates HTTP server, attaches Socket.IO, starts scheduler

import { createServer } from 'http';
import { createApp } from './app.js';
import { createSocketServer } from './realtime/socket.server.js';
import { createColyseusServer, colyseusServer } from './multiplayer/colyseus.server.js';
import { pool } from './db/pool.js';
import { logger } from './logger.js';
import { config } from './config.js';

async function main() {
  const app = createApp();
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);
  createColyseusServer(httpServer);

  httpServer.listen(config.PORT, '0.0.0.0', () => {
    logger.info({ port: config.PORT, host: '0.0.0.0', env: config.NODE_ENV }, '🚀 RunAlive server listening');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    httpServer.close(async () => {
      io.close();
      if (colyseusServer) {
        colyseusServer.gracefullyShutdown();
      }
      await pool.end();
      logger.info('Shutdown complete');
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
