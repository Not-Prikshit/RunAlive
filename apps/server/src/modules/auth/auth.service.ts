// apps/server/src/modules/auth/auth.service.ts
// Authentication service: argon2id password hashing, JWTs, token rotation, family reuse detection.

import crypto from 'node:crypto';
import argon2 from 'argon2';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import type { RegisterInput, LoginInput, UserProfile } from '@runalive/shared';
import { config } from '../../config.js';
import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../app.js';
import { mailer } from './mailer.js';

const accessSecret = new TextEncoder().encode(config.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(config.JWT_REFRESH_SECRET);

// Pre-computed dummy argon2id hash to prevent timing attacks when email does not exist
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$e7s5fL5v4a9+K1n3W0/7xA$Q9K0i8R3g8N2v6J5m4l1x0K9y8Z7w6V5u4T3s2R1q0P';

export interface AccessTokenPayload extends JWTPayload {
  sub: string; // userId
  displayName: string;
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string; // userId
  family: string;
  jti: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

/**
 * Hash a plain password using argon2id.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verify a plain password against an argon2id hash.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * SHA-256 hash helper for storing refresh & reset tokens securely.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Sign a short-lived access JWT (default 15 minutes).
 */
export async function signAccessToken(payload: { userId: string; displayName: string }): Promise<string> {
  return new SignJWT({ displayName: payload.displayName })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(config.JWT_ACCESS_EXPIRES_IN)
    .sign(accessSecret);
}

/**
 * Verify an access JWT.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify<AccessTokenPayload>(token, accessSecret);
  return payload;
}

/**
 * Sign a long-lived rotating refresh JWT (default 30 days).
 */
export async function signRefreshToken(payload: {
  userId: string;
  family: string;
  jti: string;
}): Promise<string> {
  return new SignJWT({ family: payload.family })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setJti(payload.jti)
    .setIssuedAt()
    .setExpirationTime(`${config.JWT_REFRESH_EXPIRES_DAYS}d`)
    .sign(refreshSecret);
}

/**
 * Verify a refresh JWT.
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify<RefreshTokenPayload>(token, refreshSecret);
  return payload;
}

/**
 * Register a new user with argon2id hashed password and return tokens.
 */
export async function register(input: RegisterInput): Promise<AuthTokens> {
  const email = input.email.toLowerCase().trim();

  // Check if active user already exists
  const existing = await query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email]
  );

  if (existing.rows.length > 0) {
    throw new AppError('EMAIL_EXISTS', 'An account with this email already exists', 409);
  }

  const passwordHash = await hashPassword(input.password);

  const userResult = await query<{
    id: string;
    email: string;
    display_name: string;
    avatar_url: string | null;
    created_at: Date;
  }>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, avatar_url, created_at`,
    [email, passwordHash, input.displayName.trim()]
  );

  const userRow = userResult.rows[0]!;
  const user: UserProfile = {
    id: userRow.id,
    email: userRow.email,
    displayName: userRow.display_name,
    avatarUrl: userRow.avatar_url,
    createdAt: userRow.created_at.toISOString(),
  };

  const family = uuidv4();
  const jti = uuidv4();
  const refreshToken = await signRefreshToken({ userId: user.id, family, jti });
  const refreshTokenHash = hashToken(refreshToken);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' days')::INTERVAL)`,
    [user.id, refreshTokenHash, family, config.JWT_REFRESH_EXPIRES_DAYS]
  );

  const accessToken = await signAccessToken({ userId: user.id, displayName: user.displayName });

  return { user, accessToken, refreshToken };
}

/**
 * Authenticate user with uniform timing protection.
 */
export async function login(input: LoginInput): Promise<AuthTokens> {
  const email = input.email.toLowerCase().trim();

  const result = await query<{
    id: string;
    email: string;
    password_hash: string;
    display_name: string;
    avatar_url: string | null;
    created_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT id, email, password_hash, display_name, avatar_url, created_at, deleted_at
     FROM users
     WHERE email = $1`,
    [email]
  );

  const userRow = result.rows[0];

  if (!userRow || userRow.deleted_at !== null) {
    // Run dummy verify to prevent timing enumeration
    await verifyPassword(DUMMY_HASH, input.password).catch(() => false);
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  const isPasswordValid = await verifyPassword(userRow.password_hash, input.password);
  if (!isPasswordValid) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  const user: UserProfile = {
    id: userRow.id,
    email: userRow.email,
    displayName: userRow.display_name,
    avatarUrl: userRow.avatar_url,
    createdAt: userRow.created_at.toISOString(),
  };

  const family = uuidv4();
  const jti = uuidv4();
  const refreshToken = await signRefreshToken({ userId: user.id, family, jti });
  const refreshTokenHash = hashToken(refreshToken);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' days')::INTERVAL)`,
    [user.id, refreshTokenHash, family, config.JWT_REFRESH_EXPIRES_DAYS]
  );

  const accessToken = await signAccessToken({ userId: user.id, displayName: user.displayName });

  return { user, accessToken, refreshToken };
}

/**
 * Refresh access token using rotating refresh token with family reuse detection.
 */
export async function refresh(oldRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  let payload: RefreshTokenPayload;
  try {
    payload = await verifyRefreshToken(oldRefreshToken);
  } catch (_err) {
    throw new AppError('INVALID_TOKEN', 'Invalid or expired refresh token', 401);
  }

  const tokenHash = hashToken(oldRefreshToken);

  return withTransaction(async (client) => {
    const tokenResult = await client.query<{
      id: string;
      user_id: string;
      family: string;
      used_at: Date | null;
      revoked_at: Date | null;
      expires_at: Date;
    }>(
      `SELECT id, user_id, family, used_at, revoked_at, expires_at
       FROM refresh_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    const tokenRow = tokenResult.rows[0];

    if (!tokenRow || tokenRow.revoked_at !== null) {
      throw new AppError('INVALID_TOKEN', 'Invalid or revoked refresh token', 401);
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      throw new AppError('EXPIRED_TOKEN', 'Refresh token expired', 401);
    }

    // Reuse detection: token was already used! Revoke entire family
    if (tokenRow.used_at !== null) {
      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE family = $1 AND revoked_at IS NULL`,
        [tokenRow.family]
      );
      throw new AppError('TOKEN_REUSED', 'Refresh token reuse detected — session revoked', 401);
    }

    // Mark current token as used
    await client.query(
      `UPDATE refresh_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [tokenRow.id]
    );

    // Fetch user details for access token
    const userResult = await client.query<{
      id: string;
      display_name: string;
      deleted_at: Date | null;
    }>(
      `SELECT id, display_name, deleted_at
       FROM users
       WHERE id = $1`,
      [tokenRow.user_id]
    );

    const user = userResult.rows[0];
    if (!user || user.deleted_at !== null) {
      throw new AppError('USER_NOT_FOUND', 'User account no longer active', 401);
    }

    // Issue new refresh token in the same family
    const nextJti = uuidv4();
    const newRefreshToken = await signRefreshToken({
      userId: user.id,
      family: tokenRow.family,
      jti: nextJti,
    });
    const newRefreshTokenHash = hashToken(newRefreshToken);

    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family, expires_at)
       VALUES ($1, $2, $3, NOW() + ($4 || ' days')::INTERVAL)`,
      [user.id, newRefreshTokenHash, tokenRow.family, config.JWT_REFRESH_EXPIRES_DAYS]
    );

    const accessToken = await signAccessToken({ userId: user.id, displayName: user.display_name });

    return { accessToken, refreshToken: newRefreshToken };
  });
}

/**
 * Revoke a refresh token on logout.
 */
export async function logout(refreshTokenStr?: string): Promise<void> {
  if (!refreshTokenStr) return;

  const tokenHash = hashToken(refreshTokenStr);
  await query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}

/**
 * Create a password reset request and email token link.
 * Never throws on non-existent emails to avoid user enumeration.
 */
export async function forgotPassword(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  const result = await query<{ id: string; email: string }>(
    `SELECT id, email
     FROM users
     WHERE email = $1 AND deleted_at IS NULL`,
    [normalizedEmail]
  );

  const user = result.rows[0];
  if (!user) {
    // Return silently to prevent email enumeration
    return;
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(resetToken);

  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
    [user.id, tokenHash]
  );

  await mailer.sendPasswordResetEmail(user.email, resetToken);
}

/**
 * Reset password using valid, unexpired reset token.
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);

  await withTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      user_id: string;
      used_at: Date | null;
      expires_at: Date;
    }>(
      `SELECT id, user_id, used_at, expires_at
       FROM password_reset_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    const tokenRow = result.rows[0];

    if (!tokenRow || tokenRow.used_at !== null || new Date(tokenRow.expires_at) < new Date()) {
      throw new AppError('INVALID_RESET_TOKEN', 'Reset token is invalid or has expired', 400);
    }

    const newHash = await hashPassword(newPassword);

    // Update user password
    await client.query(
      `UPDATE users
       SET password_hash = $1, updated_at = NOW()
       WHERE id = $2`,
      [newHash, tokenRow.user_id]
    );

    // Mark reset token used
    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE id = $1`,
      [tokenRow.id]
    );

    // Revoke all existing refresh tokens for the user
    await client.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [tokenRow.user_id]
    );
  });
}
