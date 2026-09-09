import assert from 'node:assert/strict';

import { prisma } from '../src/db/prisma.js';
import { env } from '../src/lib/env.js';
import { signAuthToken } from '../src/lib/jwt.js';
import { hashPassword } from '../src/lib/password.js';

const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer << /Root 1 0 R >>\nstartxref\n0\n%%EOF\n');

type User = { id: string; token: string };
async function makeUser(label: string): Promise<User> {
  const user = await prisma.user.create({
    data: {
      name: `Document E2E ${label}`,
      email: `document-e2e-${label}-${Date.now()}@example.test`,
      passwordHash: await hashPassword('unused-password'),
      emailVerified: true,
    },
  });
  return { id: user.id, token: await signAuthToken(user.id) };
}

async function upload(token: string, filename: string, body: Buffer, type = 'application/pdf') {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(body).buffer as ArrayBuffer], { type }), filename);
  const response = await fetch(`${base}/api/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { response, body: await response.json() as Record<string, unknown> };
}

const owner = await makeUser('one');
const otherOwner = await makeUser('two');
try {
  const unauthenticated = await fetch(`${base}/api/documents`, { method: 'POST' });
  assert.equal(unauthenticated.status, 401);

  const missingFile = await fetch(`${base}/api/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.equal(missingFile.status, 400);

  const nonPdf = await upload(owner.token, 'notes.pdf', Buffer.from('not a PDF'));
  assert.equal(nonPdf.response.status, 415);

  const oversized = await upload(owner.token, 'large.pdf', Buffer.alloc(env.MAX_PDF_SIZE_BYTES + 1, 0x61));
  assert.equal(oversized.response.status, 413);

  const created = await upload(owner.token, 'Contract.PDF', pdf);
  assert.equal(created.response.status, 201);
  assert.equal(created.body.filename, 'Contract.PDF');
  assert.equal(created.body.mimeType, 'application/pdf');
  assert.equal('storageKey' in created.body, false);
  assert.equal('normalizedFilename' in created.body, false);

  const duplicate = await upload(owner.token, 'contract.pdf', pdf);
  assert.equal(duplicate.response.status, 409);

  const sameNameOtherUser = await upload(otherOwner.token, 'contract.pdf', pdf);
  assert.equal(sameNameOtherUser.response.status, 201);

  const stored = await prisma.document.findUnique({ where: { id: created.body.id as string } });
  assert.ok(stored);
  const anonymous = await fetch(`https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${stored.storageKey}`);
  assert.equal(anonymous.status, 403);

  console.log('document E2E checks: OK');
} finally {
  await prisma.user.deleteMany({ where: { id: { in: [owner.id, otherOwner.id] } } });
  await prisma.$disconnect();
}
