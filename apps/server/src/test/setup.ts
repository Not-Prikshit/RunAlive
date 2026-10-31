// apps/server/src/test/setup.ts
// Global test setup

import { afterAll } from 'vitest';
import { pool } from '../db/pool.js';

// Ensure we are in test env
if (process.env['NODE_ENV'] !== 'test') {
  process.env['NODE_ENV'] = 'test';
}

// Minimal env for config to parse when running tests without .env
process.env['JWT_ACCESS_SECRET'] ??= 'test-access-secret-minimum-32-chars-long-!!!';
process.env['JWT_REFRESH_SECRET'] ??= 'test-refresh-secret-minimum-32-chars-long-!!';
process.env['DATABASE_URL'] ??= 'postgresql://runalive:runalive_test@localhost:5432/runalive_test';
process.env['DATABASE_URL_TEST'] ??= 'postgresql://runalive:runalive_test@localhost:5432/runalive_test';

afterAll(async () => {
  await pool.end();
});
