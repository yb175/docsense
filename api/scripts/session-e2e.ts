import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { prisma } from '../src/db/prisma.js';
import { guestSessionKey, redis } from '../src/db/redis.js';
import { signAuthToken } from '../src/lib/jwt.js';
import { hashPassword } from '../src/lib/password.js';
import { GUEST_PERMISSIONS, GUEST_SESSION_TTL_SECONDS, hashShareToken } from '../src/services/share.service.js';

const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const token = randomBytes(32).toString('base64url');
const sessionId = randomBytes(32).toString('base64url');
const otherSessionId = randomBytes(32).toString('base64url');
const user = await prisma.user.create({
  data: {
    name: 'Session E2E',
    email: `session-e2e-${Date.now()}@example.test`,
    passwordHash: await hashPassword('unused-password'),
    emailVerified: true,
  },
});

try {
  const document = await prisma.document.create({
    data: {
      ownerId: user.id,
      filename: 'Session.pdf',
      normalizedFilename: 'session.pdf',
      storageKey: `e2e/${randomBytes(8).toString('hex')}.pdf`,
      sizeBytes: 1,
      mimeType: 'application/pdf',
    },
  });
  const share = await prisma.documentShare.create({
    data: {
      documentId: document.id,
      inviteeEmail: 'guest@example.test',
      inviteeName: 'Guest',
      tokenHash: hashShareToken(token),
      status: 'ACCEPTED',
      expiresAt: new Date(Date.now() + GUEST_SESSION_TTL_SECONDS * 1000),
    },
  });
  const session = { shareId: share.id, documentId: document.id, inviteeEmail: share.inviteeEmail, permissions: GUEST_PERMISSIONS, expiresAt: new Date(Date.now() + GUEST_SESSION_TTL_SECONDS * 1000).toISOString() };
  await redis.set(guestSessionKey(sessionId), JSON.stringify(session), 'EX', GUEST_SESSION_TTL_SECONDS);
  await redis.set(guestSessionKey(otherSessionId), JSON.stringify({ ...session, shareId: crypto.randomUUID() }), 'EX', GUEST_SESSION_TTL_SECONDS);

  const jwt = await signAuthToken(user.id);
  const me = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${jwt}` } });
  assert.equal(me.status, 200, 'a valid JWT must restore the owner session');

  const restored = await fetch(`${base}/api/shares/${token}/session`, { headers: { Cookie: `docsense_guest_session=${sessionId}` } });
  assert.equal(restored.status, 200);
  assert.deepEqual(await restored.json(), { documentId: document.id, verified: true }, 'a matching guest session must restore the shared document');

  const mismatched = await fetch(`${base}/api/shares/${token}/session`, { headers: { Cookie: `docsense_guest_session=${otherSessionId}` } });
  assert.equal(mismatched.status, 200);
  assert.deepEqual(await mismatched.json(), { documentId: null, verified: false }, 'a guest session must not unlock a different share');

  console.log('session e2e checks: OK');
} finally {
  await redis.del(guestSessionKey(sessionId), guestSessionKey(otherSessionId));
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}
