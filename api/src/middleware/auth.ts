import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';

import { redis } from '../db/redis.js';
import { unauthorized } from '../lib/errors.js';
import { verifyAuthToken } from '../lib/jwt.js';
import type { AppEnv } from '../types/index.js';

/**
 * Requires `Authorization: Bearer <jwt>`, rejects revoked tokens via the
 * Redis blacklist, and exposes the verified identity as `c.get('auth')`.
 * Never trust a client-supplied user id.
 */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : getCookie(c, 'docsense_auth');
  if (token) {
    const auth = await verifyAuthToken(token).catch(() => {
      throw unauthorized('Invalid or expired token');
    });
    if (await redis.exists(`jwt:revoked:${auth.jti}`)) throw unauthorized('Token has been revoked');
    c.set('auth', auth);
  }
  await next();
});

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : getCookie(c, 'docsense_auth');
  if (!token) throw unauthorized('Missing authentication');

  const auth = await verifyAuthToken(token).catch(() => {
    throw unauthorized('Invalid or expired token');
  });

  if (await redis.exists(`jwt:revoked:${auth.jti}`)) {
    throw unauthorized('Token has been revoked');
  }

  c.set('auth', auth);
  await next();
});
