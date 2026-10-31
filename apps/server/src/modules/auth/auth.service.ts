// apps/server/src/modules/auth/auth.service.ts
// JWT utilities used across modules

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { config } from '../../config.js';

const accessSecret = new TextEncoder().encode(config.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(config.JWT_REFRESH_SECRET);

export interface AccessTokenPayload extends JWTPayload {
  sub: string; // userId
  displayName: string;
}

export async function signAccessToken(payload: { userId: string; displayName: string }): Promise<string> {
  return new SignJWT({ displayName: payload.displayName })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(config.JWT_ACCESS_EXPIRES_IN)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify<AccessTokenPayload>(token, accessSecret);
  return payload;
}

export async function signRefreshToken(payload: { userId: string; family: string }): Promise<string> {
  return new SignJWT({ family: payload.family })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${config.JWT_REFRESH_EXPIRES_DAYS}d`)
    .sign(refreshSecret);
}

export async function verifyRefreshToken(token: string): Promise<JWTPayload & { sub: string; family: string }> {
  const { payload } = await jwtVerify<JWTPayload & { sub: string; family: string }>(token, refreshSecret);
  return payload;
}
