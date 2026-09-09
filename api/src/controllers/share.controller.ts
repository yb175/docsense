import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import { guestSessionKey, redis } from '../db/redis.js';
import { createShare, listShares, requestGuestOtp, revokeShare, verifyGuestOtp } from '../services/share.service.js';
import type { AppEnv } from '../types/index.js';

const secureCookie = process.env.NODE_ENV === 'production';

export async function createShareHandler(c: Context<AppEnv>) {
  const input = c.get('body') as { inviteeEmail: string; inviteeName: string };
  const share = await createShare({ documentId: c.req.param('documentId')!, ownerId: c.get('auth').userId, ...input });
  const { shareUrl: _shareUrl, ...safeShare } = share;
  return c.json({ share: safeShare, message: 'Share invitation sent' }, 201);
}

export async function listSharesHandler(c: Context<AppEnv>) {
  return c.json({ shares: await listShares(c.req.param('documentId')!, c.get('auth').userId) });
}

export async function revokeShareHandler(c: Context<AppEnv>) {
  return c.json(await revokeShare({ documentId: c.req.param('documentId')!, shareId: c.req.param('shareId')!, ownerId: c.get('auth').userId }));
}

export async function requestGuestOtpHandler(c: Context<AppEnv>) {
  return c.json(await requestGuestOtp(c.get('body') as { token: string; email: string }));
}

export async function verifyGuestOtpHandler(c: Context<AppEnv>) {
  const result = await verifyGuestOtp(c.get('body') as { token: string; email: string; otp: string });
  setCookie(c, 'docsense_guest_session', result.sessionId, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'Lax',
    path: '/',
    maxAge: result.maxAge,
  });
  return c.json({ documentId: result.documentId, message: 'Guest access verified' });
}

export async function guestLogoutHandler(c: Context<AppEnv>) {
  const sessionId = getCookie(c, 'docsense_guest_session');
  if (sessionId) await redis.del(guestSessionKey(sessionId));
  deleteCookie(c, 'docsense_guest_session', { path: '/' });
  return c.body(null, 204);
}
