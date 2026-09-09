import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { SignJWT } from 'jose';

import { prisma } from '../src/db/prisma.js';
import { guestSessionKey, redis } from '../src/db/redis.js';
import { env } from '../src/lib/env.js';
import { signAuthToken } from '../src/lib/jwt.js';
import { hashPassword } from '../src/lib/password.js';
import { GUEST_PERMISSIONS, GUEST_SESSION_TTL_SECONDS } from '../src/services/share.service.js';

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
function nextMessage(socket: WebSocket, timeout = 2_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket event')), timeout);
    socket.once('message', (data) => { clearTimeout(timer); resolve(JSON.parse(data.toString())); });
  });
}
async function noMessage(socket: WebSocket, timeout = 150) {
  await assert.rejects(nextMessage(socket, timeout), /Timed out/);
}
async function post(documentId: string, token: string, parentId: string | null = null) {
  const response = await fetch(`${base}/api/documents/${documentId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ parentId, content: { blocks: [{ type: 'paragraph', content: [{ text: 'live', marks: [] }] }] } }),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) as any };
}
const cookie = (id: string) => ({ Cookie: `docsense_guest_session=${id}` });
const tokenA = await signAuthToken(userA.id);
const tokenB = await signAuthToken(userB.id);
const expiredToken = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userA.id).setJti(randomBytes(8).toString('hex')).setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(Math.floor(Date.now() / 1000) - 3600).sign(new TextEncoder().encode(env.JWT_SECRET));
const openSockets: WebSocket[] = [];

try {
  const owner = await connect(docA.id, { Authorization: `Bearer ${tokenA}` });
  assert.ok(owner.socket); openSockets.push(owner.socket);
  assert.equal((await connect(docA.id, { Authorization: `Bearer ${tokenB}` })).status, 403);
  assert.equal((await connect(docA.id, { Authorization: 'Bearer invalid.jwt.value' })).status, 401);
  assert.equal((await connect(docA.id, { Authorization: `Bearer ${expiredToken}` })).status, 401);
  const guest = await connect(docA.id, cookie(session));
  assert.ok(guest.socket); openSockets.push(guest.socket);
  const guest2 = await connect(docA.id, cookie(session));
  assert.ok(guest2.socket); openSockets.push(guest2.socket);
  const otherDocument = await connect(docB.id, { Authorization: `Bearer ${tokenB}` });
  assert.ok(otherDocument.socket); openSockets.push(otherDocument.socket);
  assert.equal((await connect(docA.id, cookie('invalid-session'))).status, 403);
  assert.equal((await connect(docA.id, cookie(expiredSession))).status, 403);
  assert.equal((await connect(docB.id, cookie(session))).status, 403);

  const ownerEvent = nextMessage(owner.socket);
  const guestEvent = nextMessage(guest.socket);
  const guest2Event = nextMessage(guest2.socket);
  const created = await post(docA.id, tokenA);
  assert.equal(created.status, 201);
  const events = await Promise.all([ownerEvent, guestEvent, guest2Event]);
  for (const event of events) {
    assert.equal(event.type, 'comment.created');
    assert.equal(event.documentId, docA.id);
    assert.equal(event.comment.id, created.body.comment.id);
    assert.equal(event.comment.parentId, null);
    assert.equal(/passwordHash|JWT|token|shareId|userId/i.test(JSON.stringify(event)), false);
  }
  await noMessage(otherDocument.socket);

  const replyOwnerEvent = nextMessage(owner.socket);
  const replyGuestEvent = nextMessage(guest.socket);
  const replyGuest2Event = nextMessage(guest2.socket);
  const reply = await post(docA.id, tokenA, created.body.comment.id);
  assert.equal(reply.status, 201);
  const replyEvent = await replyOwnerEvent;
  assert.equal(replyEvent.comment.parentId, created.body.comment.id);
  await replyGuestEvent;
  await replyGuest2Event;
  assert.equal((await post(docB.id, tokenB, created.body.comment.id)).status, 400);

  guest.socket.close();
  const afterOwnerEvent = nextMessage(owner.socket);
  const afterGuestEvent = nextMessage(guest2.socket);
  const afterDisconnect = await post(docA.id, tokenA);
  assert.equal(afterDisconnect.status, 201);
  await afterOwnerEvent;
  await afterGuestEvent;
  await noMessage(otherDocument.socket);
  console.log('comment WebSocket broadcast E2E checks: OK');
} finally {
  for (const socket of openSockets) socket.close();
  await redis.del(guestSessionKey(session), guestSessionKey(expiredSession));
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await prisma.$disconnect();
  redis.disconnect();
}
