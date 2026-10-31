// apps/server/src/logger.ts
import pino, { type LoggerOptions } from 'pino';
import { config } from './config.js';

const options: LoggerOptions = {
  level: config.LOG_LEVEL,
  redact: {
    paths: ['*.password', '*.token', '*.refreshToken', '*.accessToken', '*.lat', '*.lon', '*.coordinates'],
    censor: '[REDACTED]',
  },
};

if (config.NODE_ENV !== 'production') {
  options.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' },
  };
}

export const logger = pino(options);
