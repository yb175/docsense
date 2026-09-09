import { randomUUID } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';

import { env } from './env.js';

/** Auth tokens live exactly 3 days. */
export const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 3;

const secretKey = new TextEncoder().encode(env.JWT_SECRET);

export interface AuthToken {
  userId: string;
  jti: string;
  /** Seconds since epoch. */
  exp: number;
}

export async function signAuthToken(userId: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + AUTH_TOKEN_TTL_SECONDS)
    .sign(secretKey);
}

/** Throws if the signature is invalid or the token is expired. */
export async function verifyAuthToken(token: string): Promise<AuthToken> {
  const { payload } = await jwtVerify(token, secretKey, {
    algorithms: ['HS256'],
    clockTolerance: 0,
  });

  if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string' || typeof payload.exp !== 'number') {
    throw new Error('Token is missing required claims');
  }

  return { userId: payload.sub, jti: payload.jti, exp: payload.exp };
}
