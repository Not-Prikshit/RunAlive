// apps/server/src/logger.ts
import pino, { type LoggerOptions } from 'pino';
import { config } from './config.js';

const options: LoggerOptions = {
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'password',
      'password_hash',
      'passwordHash',
      'token',
      'refreshToken',
      'accessToken',
      'jwt',
      'secret',
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.password_hash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.secret',
      '*.lat',
      '*.lon',
      '*.coordinates',
    ],
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
