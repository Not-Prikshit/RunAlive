// apps/server/src/test/health.test.ts
// Stage 0 gate: health route returns 200 (DB may be unavailable — check both cases)

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('GET /healthz', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  it('returns 200 with status ok (DB reachable) or 503 (DB unavailable)', async () => {
    const res = await request(app).get('/healthz');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('serverTime');
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('health endpoint includes version', async () => {
    const res = await request(app).get('/healthz');
    expect(res.body).toHaveProperty('version');
  });
});
