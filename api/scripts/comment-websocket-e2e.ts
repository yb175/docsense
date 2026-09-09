import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';

import { prisma } from '../src/db/prisma.js';
import { guestSessionKey, redis } from '../src/db/redis.js';
import { signAuthToken } from '../src/lib/jwt.js';
import { hashPassword } from '../src/lib/password.js';
import { GUEST_PERMISSIONS, GUEST_SESSION_TTL_SECONDS } from '../src/services/share.service.js';
import { SignJWT } from 'jose';
import { env } from '../src/lib/env.js';

const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const wsBase = base.replace(/^http/u, 'ws');
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const userA = await prisma.user.create({ data: { name: 'WS A', email: `ws-a-${suffix}@example.test`, passwordHash: await hashPassword('unused'), emailVerified: true } });
const userB = await prisma.user.create({ data: { name: 'WS B', email: `ws-b-${suffix}@example.test`, passwordHash: await hashPassword('unused'), emailVerified: true } });
const docA = await prisma.document.create({ data: { ownerId: userA.id, filename: 'a.pdf', normalizedFilename: `ws-a-${suffix}`, storageKey: `e2e/ws-${suffix}-a`, sizeBytes: 1, mimeType: 'application/pdf' } });
const docB = await prisma.document.create({ data: { ownerId: userB.id, filename: 'b.pdf', normalizedFilename: `ws-b-${suffix}`, storageKey: `e2e/ws-${suffix}-b`, sizeBytes: 1, mimeType: 'application/pdf' } });
const share = await prisma.documentShare.create({ data: { documentId: docA.id, inviteeEmail: 'ws-guest@example.test', inviteeName: 'Guest', tokenHash: `unused-${suffix}`, status: 'ACCEPTED', expiresAt: new Date(Date.now() + 60_000) } });
const session = randomBytes(32).toString('base64url');
const expiredSession = randomBytes(32).toString('base64url');
const sessionData = { shareId: share.id, documentId: docA.id, inviteeEmail: share.inviteeEmail, permissions: GUEST_PERMISSIONS, expiresAt: new Date(Date.now() + 60_000).toISOString() };
await redis.set(guestSessionKey(session), JSON.stringify(sessionData), 'EX', GUEST_SESSION_TTL_SECONDS);
await redis.set(guestSessionKey(expiredSession), JSON.stringify({ ...sessionData, expiresAt: new Date(Date.now() - 1_000).toISOString() }), 'EX', GUEST_SESSION_TTL_SECONDS);

function connect(documentId: string, headers: Record<string, string> = {}) {
  return new Promise<{ socket?: WebSocket; status?: number }>((resolve) => {
    const socket = new WebSocket(`${wsBase}/ws/documents/${documentId}/comments`, { headers });
    socket.once('open', () => resolve({ socket }));
    socket.once('unexpected-response', (_request, response) => { response.resume(); resolve({ status: response.statusCode }); });
    socket.once('error', () => resolve({}));
  });
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const cookie = (id: string) => ({ Cookie: `docsense_guest_session=${id}` });
const tokenA = await signAuthToken(userA.id);
const tokenB = await signAuthToken(userB.id);
const expiredToken = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userA.id).setJti(randomBytes(8).toString('hex')).setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(Math.floor(Date.now() / 1000) - 3600).sign(new TextEncoder().encode(env.JWT_SECRET));

try {
  const authorized = await connect(docA.id, auth(tokenA));
  assert.ok(authorized.socket); authorized.socket.close();
  assert.equal((await connect(docA.id, auth(tokenB))).status, 403);
  assert.equal((await connect(docA.id, auth('invalid.jwt.value'))).status, 401);
  assert.equal((await connect(docA.id, auth(expiredToken))).status, 401);
  const guest = await connect(docA.id, cookie(session));
  assert.ok(guest.socket); guest.socket.close();
  assert.equal((await connect(docA.id, cookie('invalid-session'))).status, 403);
  assert.equal((await connect(docA.id, cookie(expiredSession))).status, 403);
  assert.equal((await connect(docB.id, cookie(session))).status, 403);
  console.log('comment WebSocket E2E checks: OK');
} finally {
  await redis.del(guestSessionKey(session), guestSessionKey(expiredSession));
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await prisma.$disconnect();
  redis.disconnect();
}
