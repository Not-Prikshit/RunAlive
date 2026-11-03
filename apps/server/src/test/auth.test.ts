// apps/server/src/test/auth.test.ts
// Stage 2 test suite: argon2id, JWTs, token rotation, reuse detection, auth endpoints, me router

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import * as poolModule from '../db/pool.js';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../modules/auth/auth.service.js';

describe('Auth Service — Cryptographic Primitives', () => {
  it('hashes passwords using argon2id and verifies correctly', async () => {
    const password = 'SuperSecretPassword123!';
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^\$argon2id\$/);
    const isValid = await verifyPassword(hash, password);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword(hash, 'WrongPassword123!');
    expect(isInvalid).toBe(false);
  });

  it('generates consistent sha256 token hashes', () => {
    const token = 'random-token-string-abc-123';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex is 64 chars
  });

  it('signs and verifies access tokens', async () => {
    const payload = { userId: '11111111-1111-1111-1111-111111111111', displayName: 'SpeedyRunner' };
    const token = await signAccessToken(payload);

    expect(typeof token).toBe('string');
    const verified = await verifyAccessToken(token);
    expect(verified.sub).toBe(payload.userId);
    expect(verified.displayName).toBe(payload.displayName);
  });

  it('signs and verifies refresh tokens', async () => {
    const payload = {
      userId: '11111111-1111-1111-1111-111111111111',
      family: '22222222-2222-2222-2222-222222222222',
      jti: '33333333-3333-3333-3333-333333333333',
    };
    const token = await signRefreshToken(payload);

    expect(typeof token).toBe('string');
    const verified = await verifyRefreshToken(token);
    expect(verified.sub).toBe(payload.userId);
    expect(verified.family).toBe(payload.family);
  });

  it('rejects tampered access tokens', async () => {
    const token = await signAccessToken({ userId: 'user-1', displayName: 'Player' });
    const tampered = token.slice(0, -5) + 'xxxxx';

    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });
});

describe('Auth Endpoints & Workflows (Supertest)', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  it('POST /api/v1/auth/register creates user and returns tokens', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'runner@campus.edu',
      display_name: 'CampusRunner',
      avatar_url: null,
      created_at: new Date('2025-01-01T00:00:00.000Z'),
    };

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('SELECT id FROM users WHERE email')) {
        return { rows: [] } as any;
      }
      if (sql.includes('INSERT INTO users')) {
        return { rows: [mockUser] } as any;
      }
      if (sql.includes('INSERT INTO refresh_tokens')) {
        return { rows: [] } as any;
      }
      return { rows: [] } as any;
    });

    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'runner@campus.edu',
      password: 'StrongPassword123!',
      displayName: 'CampusRunner',
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user).toEqual({
      id: 'user-123',
      email: 'runner@campus.edu',
      displayName: 'CampusRunner',
      avatarUrl: null,
      createdAt: '2025-01-01T00:00:00.000Z',
    });
  });

  it('POST /api/v1/auth/register rejects duplicate email with 409', async () => {
    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('SELECT id FROM users WHERE email')) {
        return { rows: [{ id: 'existing-id' }] } as any;
      }
      return { rows: [] } as any;
    });

    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'existing@campus.edu',
      password: 'StrongPassword123!',
      displayName: 'Duplicate',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_EXISTS');
  });

  it('POST /api/v1/auth/login succeeds with correct password', async () => {
    const plainPassword = 'CorrectPassword123!';
    const passwordHash = await hashPassword(plainPassword);

    const mockUser = {
      id: 'user-456',
      email: 'seeker@campus.edu',
      password_hash: passwordHash,
      display_name: 'CampusSeeker',
      avatar_url: null,
      created_at: new Date('2025-01-01T00:00:00.000Z'),
      deleted_at: null,
    };

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('FROM users WHERE email = $1')) {
        return { rows: [mockUser] } as any;
      }
      if (sql.includes('INSERT INTO refresh_tokens')) {
        return { rows: [] } as any;
      }
      return { rows: [] } as any;
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'seeker@campus.edu',
      password: plainPassword,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe('seeker@campus.edu');
  });

  it('POST /api/v1/auth/login returns uniform 401 for wrong password or missing user', async () => {
    // 1. Missing user
    vi.spyOn(poolModule, 'query').mockImplementation(async () => {
      return { rows: [] } as any;
    });

    const res1 = await request(app).post('/api/v1/auth/login').send({
      email: 'unknown@campus.edu',
      password: 'Password123!',
    });

    expect(res1.status).toBe(401);
    expect(res1.body.error.code).toBe('INVALID_CREDENTIALS');

    // 2. Wrong password
    const realHash = await hashPassword('ActualPassword123!');
    vi.spyOn(poolModule, 'query').mockImplementation(async () => {
      return {
        rows: [
          {
            id: 'u-1',
            email: 'user@campus.edu',
            password_hash: realHash,
            display_name: 'Test',
            avatar_url: null,
            created_at: new Date(),
            deleted_at: null,
          },
        ],
      } as any;
    });

    const res2 = await request(app).post('/api/v1/auth/login').send({
      email: 'user@campus.edu',
      password: 'WrongPassword123!',
    });

    expect(res2.status).toBe(401);
    expect(res2.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /api/v1/auth/refresh rotates token', async () => {
    const family = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const userId = '11111111-1111-1111-1111-111111111111';
    const initialToken = await signRefreshToken({ userId, family, jti: 'jti-1' });

    vi.spyOn(poolModule, 'withTransaction').mockImplementation(async (fn: any) => {
      const mockClient = {
        query: vi.fn().mockImplementation(async (text: string) => {
          const sql = text.replace(/\s+/g, ' ');
          if (sql.includes('FROM refresh_tokens WHERE token_hash')) {
            return {
              rows: [
                {
                  id: 'tok-1',
                  user_id: userId,
                  family,
                  used_at: null,
                  revoked_at: null,
                  expires_at: new Date(Date.now() + 86400000),
                },
              ],
            };
          }
          if (sql.includes('FROM users WHERE id = $1')) {
            return {
              rows: [{ id: userId, display_name: 'TestUser', deleted_at: null }],
            };
          }
          return { rows: [] };
        }),
      };
      return fn(mockClient);
    });

    const res = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: initialToken,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.refreshToken).not.toBe(initialToken);
  });

  it('POST /api/v1/auth/refresh detects reuse and revokes entire token family', async () => {
    const family = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const userId = '11111111-1111-1111-1111-111111111111';
    const reusedToken = await signRefreshToken({ userId, family, jti: 'jti-already-used' });

    let revokedFamily: string | null = null;

    vi.spyOn(poolModule, 'withTransaction').mockImplementation(async (fn: any) => {
      const mockClient = {
        query: vi.fn().mockImplementation(async (text: string, params: any[]) => {
          const sql = text.replace(/\s+/g, ' ');
          if (sql.includes('FROM refresh_tokens WHERE token_hash')) {
            return {
              rows: [
                {
                  id: 'tok-reused',
                  user_id: userId,
                  family,
                  used_at: new Date('2025-01-01T12:00:00Z'), // ALREADY USED!
                  revoked_at: null,
                  expires_at: new Date(Date.now() + 86400000),
                },
              ],
            };
          }
          if (sql.includes('UPDATE refresh_tokens SET revoked_at = NOW() WHERE family = $1')) {
            revokedFamily = params[0];
            return { rows: [] };
          }
          return { rows: [] };
        }),
      };
      return fn(mockClient);
    });

    const res = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: reusedToken,
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_REUSED');
    expect(revokedFamily).toBe(family);
  });

  it('POST /api/v1/auth/forgot-password returns 200 without leaking whether email exists', async () => {
    vi.spyOn(poolModule, 'query').mockResolvedValue({ rows: [] } as any);

    const res = await request(app).post('/api/v1/auth/forgot-password').send({
      email: 'nonexistent@campus.edu',
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('password reset link has been sent');
  });

  it('POST /api/v1/auth/reset-password updates password and revokes existing tokens', async () => {
    const rawToken = 'valid-reset-token-1234567890abcdef';
    const userId = 'user-reset-999';
    let updatedPasswordHash = false;
    let revokedTokens = false;

    vi.spyOn(poolModule, 'withTransaction').mockImplementation(async (fn: any) => {
      const mockClient = {
        query: vi.fn().mockImplementation(async (text: string) => {
          const sql = text.replace(/\s+/g, ' ');
          if (sql.includes('FROM password_reset_tokens WHERE token_hash')) {
            return {
              rows: [
                {
                  id: 'tok-reset-1',
                  user_id: userId,
                  used_at: null,
                  expires_at: new Date(Date.now() + 1800000), // 30 mins
                },
              ],
            };
          }
          if (sql.includes('UPDATE users SET password_hash')) {
            updatedPasswordHash = true;
            return { rows: [] };
          }
          if (sql.includes('UPDATE password_reset_tokens SET used_at')) {
            return { rows: [] };
          }
          if (sql.includes('UPDATE refresh_tokens SET revoked_at')) {
            revokedTokens = true;
            return { rows: [] };
          }
          return { rows: [] };
        }),
      };
      return fn(mockClient);
    });

    const res = await request(app).post('/api/v1/auth/reset-password').send({
      token: rawToken,
      password: 'NewSuperSecretPassword123!',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updatedPasswordHash).toBe(true);
    expect(revokedTokens).toBe(true);
  });

  it('POST /api/v1/auth/reset-password rejects expired or invalid reset token with 400', async () => {
    vi.spyOn(poolModule, 'withTransaction').mockImplementation(async (fn: any) => {
      const mockClient = {
        query: vi.fn().mockImplementation(async () => {
          return { rows: [] }; // No matching token
        }),
      };
      return fn(mockClient);
    });

    const res = await request(app).post('/api/v1/auth/reset-password').send({
      token: 'expired-or-invalid-token',
      password: 'NewSuperSecretPassword123!',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
  });
});

describe('User /me Endpoints (Supertest)', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = createApp();
  });

  it('GET /api/v1/me returns 401 when token is missing', async () => {
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/v1/me returns profile for authenticated user', async () => {
    const userId = 'user-me-123';
    const token = await signAccessToken({ userId, displayName: 'RunMaster' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('FROM users WHERE id = $1')) {
        return {
          rows: [
            {
              id: userId,
              email: 'runmaster@campus.edu',
              display_name: 'RunMaster',
              avatar_url: null,
              created_at: new Date('2025-01-01T00:00:00.000Z'),
            },
          ],
        } as any;
      }
      return { rows: [] } as any;
    });

    const res = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: userId,
      email: 'runmaster@campus.edu',
      displayName: 'RunMaster',
      avatarUrl: null,
      createdAt: '2025-01-01T00:00:00.000Z',
    });
  });

  it('PATCH /api/v1/me updates display name', async () => {
    const userId = 'user-me-123';
    const token = await signAccessToken({ userId, displayName: 'OldName' });

    vi.spyOn(poolModule, 'query').mockImplementation(async (text: string) => {
      const sql = text.replace(/\s+/g, ' ');
      if (sql.includes('UPDATE users SET display_name')) {
        return {
          rows: [
            {
              id: userId,
              email: 'user@campus.edu',
              display_name: 'NewName',
              avatar_url: null,
              created_at: new Date('2025-01-01T00:00:00.000Z'),
            },
          ],
        } as any;
      }
      return { rows: [] } as any;
    });

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'NewName' });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('NewName');
  });

  it('DELETE /api/v1/me soft deletes user account', async () => {
    const userId = 'user-me-123';
    const token = await signAccessToken({ userId, displayName: 'DeleteMe' });

    let deletedUserId: string | null = null;

    vi.spyOn(poolModule, 'withTransaction').mockImplementation(async (fn: any) => {
      const mockClient = {
        query: vi.fn().mockImplementation(async (text: string, params: any[]) => {
          const sql = text.replace(/\s+/g, ' ');
          if (sql.includes('UPDATE users SET deleted_at = NOW()')) {
            deletedUserId = params[0];
          }
          return { rows: [] };
        }),
      };
      return fn(mockClient);
    });

    const res = await request(app)
      .delete('/api/v1/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deletedUserId).toBe(userId);
  });
});
