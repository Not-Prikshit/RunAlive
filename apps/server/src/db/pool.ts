// PostgreSQL connection pool

import pg from 'pg';
import { readFileSync } from 'node:fs';
import { config } from '../config.js';
import { logger } from '../logger.js';

const { Pool } = pg;

const connectionString =
  config.NODE_ENV === 'test'
    ? (config.DATABASE_URL_TEST ?? config.DATABASE_URL)
    : config.DATABASE_URL;

// Enable SSL with rejectUnauthorized: false for all remote/cloud databases
const isRemote =
  !connectionString.includes('localhost') &&
  !connectionString.includes('127.0.0.1') &&
  !connectionString.includes('postgres:5432');

export const pool = new Pool({
  connectionString,
  max: config.NODE_ENV === 'test' ? 5 : 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
  ssl: isRemote ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected DB pool error');
});

/**
 * Execute a callback inside a transaction.
 * Automatically ROLLBACK on error.
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Shorthand for pool.query
 */
export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, values);
}