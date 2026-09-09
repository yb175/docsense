import assert from 'node:assert/strict';

import type { WSContext } from 'hono/ws';

import { prisma } from '../src/db/prisma.js';
import { commentConnections } from '../src/services/comment-connection.manager.js';
import { createComment } from '../src/services/comment.service.js';
import { hashPassword } from '../src/lib/password.js';

const suffix = `${Date.now()}`;
const user = await prisma.user.create({ data: { name: 'Broadcast Failure', email: `broadcast-failure-${suffix}@example.test`, passwordHash: await hashPassword('unused'), emailVerified: true } });
const document = await prisma.document.create({ data: { ownerId: user.id, filename: 'failure.pdf', normalizedFilename: `failure-${suffix}`, storageKey: `e2e/failure-${suffix}`, sizeBytes: 1, mimeType: 'application/pdf' } });
let sent = false;
const socket = { readyState: 1, send: () => { sent = true; }, close() {} } as unknown as WSContext;
commentConnections.add(document.id, socket);
const originalCreate = prisma.comment.create;
try {
  prisma.comment.create = (async () => { throw new Error('simulated database failure'); }) as unknown as typeof originalCreate;
  await assert.rejects(
    createComment(document.id, { parentId: null, content: { blocks: [{ type: 'paragraph', content: [{ text: 'never persisted', marks: [] }] }] } }, { userId: user.id }),
    /simulated database failure/,
  );
  assert.equal(sent, false);
  console.log('database failure broadcast check: OK');
} finally {
  prisma.comment.create = originalCreate;
  commentConnections.remove(document.id, socket);
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}
