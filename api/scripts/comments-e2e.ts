import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { prisma } from '../src/db/prisma.js';
import { guestSessionKey, redis } from '../src/db/redis.js';
import { signAuthToken } from '../src/lib/jwt.js';
import { hashPassword } from '../src/lib/password.js';
import { GUEST_PERMISSIONS, GUEST_SESSION_TTL_SECONDS } from '../src/services/share.service.js';

const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const userA = await prisma.user.create({ data: { name: 'Comment A', email: `comment-a-${suffix}@example.test`, passwordHash: await hashPassword('unused'), emailVerified: true } });
const userB = await prisma.user.create({ data: { name: 'Comment B', email: `comment-b-${suffix}@example.test`, passwordHash: await hashPassword('unused'), emailVerified: true } });
const docA = await prisma.document.create({ data: { ownerId: userA.id, filename: 'a.pdf', normalizedFilename: `a-${suffix}`, storageKey: `e2e/${suffix}-a`, sizeBytes: 1, mimeType: 'application/pdf' } });
const docB = await prisma.document.create({ data: { ownerId: userB.id, filename: 'b.pdf', normalizedFilename: `b-${suffix}`, storageKey: `e2e/${suffix}-b`, sizeBytes: 1, mimeType: 'application/pdf' } });
const share = await prisma.documentShare.create({ data: { documentId: docA.id, inviteeEmail: 'guest@example.test', inviteeName: 'Guest', tokenHash: `unused-${suffix}`, status: 'ACCEPTED', expiresAt: new Date(Date.now() + 60_000) } });
const guestSession = randomBytes(32).toString('base64url');
const expiredSession = randomBytes(32).toString('base64url');
const session = { shareId: share.id, documentId: docA.id, inviteeEmail: share.inviteeEmail, permissions: GUEST_PERMISSIONS, expiresAt: new Date(Date.now() + 60_000).toISOString() };
await redis.set(guestSessionKey(guestSession), JSON.stringify(session), 'EX', GUEST_SESSION_TTL_SECONDS);
await redis.set(guestSessionKey(expiredSession), JSON.stringify({ ...session, expiresAt: new Date(Date.now() - 1_000).toISOString() }), 'EX', GUEST_SESSION_TTL_SECONDS);

const tokenA = await signAuthToken(userA.id);
const tokenB = await signAuthToken(userB.id);
const content = (type: 'paragraph' | 'bulletList', text: string) => type === 'paragraph'
  ? { blocks: [{ type, content: [{ text, marks: [] }] }] }
  : { blocks: [{ type, items: [[{ text, marks: [] }]] }] };
async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
  return { status: response.status, body: await response.json().catch(() => ({})) as any };
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const guest = (id = guestSession) => ({ Cookie: `docsense_guest_session=${id}` });
const post = (doc: string, body: unknown, headers: Record<string, string>) => api(`/api/documents/${doc}/comments`, { method: 'POST', headers, body: JSON.stringify(body) });
const get = (doc: string, headers: Record<string, string>) => api(`/api/documents/${doc}/comments`, { headers });

try {
  assert.equal((await post(docA.id, { parentId: null, content: content('paragraph', 'A') }, auth(tokenA))).status, 201); // 1
  const top = await post(docA.id, { parentId: null, content: content('paragraph', 'top') }, auth(tokenA)); // 2
  assert.equal(top.status, 201);
  assert.equal((await get(docA.id, auth(tokenA))).status, 200); // 3
  const parentId = top.body.comment.id;
  assert.equal((await post(docA.id, { parentId, content: content('paragraph', 'reply') }, auth(tokenA))).status, 201); // 4
  assert.equal((await post(docA.id, { parentId: null, content: content('paragraph', 'no') }, auth(tokenB))).status, 403); // 5
  assert.equal((await get(docA.id, auth(tokenB))).status, 403); // 6
  assert.equal((await post(docA.id, { parentId: null, userId: userB.id, content: content('paragraph', 'x') }, auth(tokenA))).status, 400); // 7
  assert.equal((await get(docA.id, guest())).status, 200); // 8
  const guestTop = await post(docA.id, { parentId: null, content: content('paragraph', 'guest') }, guest()); // 9
  assert.equal(guestTop.status, 201);
  assert.equal(guestTop.body.comment.author.type, 'guest');
  assert.equal((await post(docA.id, { parentId: guestTop.body.comment.id, content: content('paragraph', 'guest reply') }, guest())).status, 201); // 10
  assert.equal((await get(docA.id, guest(expiredSession))).status, 403); // 11
  assert.equal((await get(docA.id, guest('invalid-session'))).status, 403); // 12
  assert.equal((await post(docA.id, { parentId: null, content: content('paragraph', 'root') }, auth(tokenA))).status, 201); // 13
  assert.equal((await post(docA.id, { parentId, content: content('paragraph', 'reply') }, auth(tokenA))).status, 201); // 14
  assert.equal((await post(docA.id, { parentId: crypto.randomUUID(), content: content('paragraph', 'reply') }, auth(tokenA))).status, 400); // 15
  assert.equal((await post(docB.id, { parentId, content: content('paragraph', 'cross') }, auth(tokenB))).status, 400); // 16
  assert.equal((await post(docA.id, { parentId: parentId, content: content('paragraph', 'cross') }, auth(tokenA))).status, 201); // 17
  assert.equal((await post(docA.id, { parentId: null, content: { blocks: [{ type: 'paragraph', content: [{ text: 'bold', marks: ['bold'] }] }] } }, auth(tokenA))).status, 201); // 18
  assert.equal((await post(docA.id, { parentId: null, content: { blocks: [{ type: 'paragraph', content: [{ text: 'italic', marks: ['italic'] }] }] } }, auth(tokenA))).status, 201); // 19
  assert.equal((await post(docA.id, { parentId: null, content: content('bulletList', 'item') }, auth(tokenA))).status, 201); // 20
  assert.equal((await post(docA.id, { parentId: null, content: '<script>alert(1)</script>' }, auth(tokenA))).status, 400); // 21
  assert.equal((await get(docB.id, auth(tokenA))).status, 403); // 22
  assert.equal((await get(docB.id, guest())).status, 403); // 23
  assert.equal((await post(docA.id, { parentId: null, shareId: share.id, content: content('paragraph', 'x') }, guest())).status, 400); // 24
  assert.equal((await post(docA.id, { parentId: null, userId: userB.id, content: content('paragraph', 'x') }, guest())).status, 400); // 25
  assert.ok((await get(docA.id, auth(tokenA))).body.comments[0].author.type === 'user'); // 26
  console.log('comment E2E checks: OK (26)');
} finally {
  await redis.del(guestSessionKey(guestSession), guestSessionKey(expiredSession));
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await prisma.$disconnect();
  redis.disconnect();
}
