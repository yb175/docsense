import assert from 'node:assert/strict';
import { MessageRole } from '@prisma/client';

import { prisma } from '../src/db/prisma.js';
import { assertTestDatabase } from './test-db.js';
import {
  appendMessage,
  createConversation,
  createDocumentChunk,
  listConversationMessages,
  listDocumentChunks,
} from '../src/services/ai-persistence.service.js';

const userId = '00000000-0000-4000-8000-000000000001';
const documentAId = '00000000-0000-4000-8000-000000000002';
const documentBId = '00000000-0000-4000-8000-000000000003';
const shareId = '00000000-0000-4000-8000-000000000004';
const fixedDate = new Date('2026-01-01T00:00:00.000Z');

async function main() {
  assertTestDatabase();
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$executeRaw`DELETE FROM "Document" WHERE "id" IN (${documentAId}::uuid, ${documentBId}::uuid)`;

  const extension = await prisma.$queryRaw<Array<{ installed: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed
  `;
  assert.equal(extension[0]?.installed, true, 'pgvector extension is not installed');

  await prisma.user.create({
    data: {
      id: userId,
      name: 'AI Foundation Test User',
      email: 'ai-foundation@example.test',
      passwordHash: 'not-used',
      emailVerified: true,
      createdAt: fixedDate,
      updatedAt: fixedDate,
    },
  });
  await prisma.document.createMany({
    data: [
      {
        id: documentAId,
        ownerId: userId,
        filename: 'a.pdf',
        normalizedFilename: 'a.pdf',
        storageKey: `test/${documentAId}.pdf`,
        sizeBytes: 1,
        mimeType: 'application/pdf',
        createdAt: fixedDate,
        updatedAt: fixedDate,
      },
      {
        id: documentBId,
        ownerId: userId,
        filename: 'b.pdf',
        normalizedFilename: 'b.pdf',
        storageKey: `test/${documentBId}.pdf`,
        sizeBytes: 1,
        mimeType: 'application/pdf',
        createdAt: fixedDate,
        updatedAt: fixedDate,
      },
    ],
  });

  await createDocumentChunk({ documentId: documentAId, chunkIndex: 0, text: 'Document A', pageStart: 1, pageEnd: 1 });
  await createDocumentChunk({ documentId: documentBId, chunkIndex: 0, text: 'Document B', pageStart: 1, pageEnd: 1 });
  assert.equal((await listDocumentChunks(documentAId)).map((chunk) => chunk.text).join(), 'Document A');
  await assert.rejects(
    () => createDocumentChunk({ documentId: documentAId, chunkIndex: 0, text: 'duplicate' }),
    /Unique constraint/i,
  );

  const vectorLiteral = `[${Array.from({ length: 3072 }, (_, index) => index === 0 ? '1' : '0').join(',')}]`;
  await prisma.$executeRaw`
    UPDATE "document_chunks"
    SET "embedding" = ${vectorLiteral}::vector
    WHERE "documentId" = ${documentAId}::uuid AND "chunkIndex" = 0
  `;
  const dimensions = await prisma.$queryRaw<Array<{ dimensions: number }>>`
    SELECT vector_dims("embedding") AS dimensions
    FROM "document_chunks"
    WHERE "documentId" = ${documentAId}::uuid AND "chunkIndex" = 0
  `;
  assert.equal(dimensions[0]?.dimensions, 3072);

  const conversation = await createConversation({ documentId: documentAId, principal: { userId } });
  const message = await appendMessage({
    documentId: documentAId,
    conversationId: conversation.id,
    role: MessageRole.USER,
    content: 'What is in document A?',
  });
  assert.equal(message.role, MessageRole.USER);
  assert.equal((await listConversationMessages(documentAId, conversation.id)).length, 1);
  assert.equal((await listConversationMessages(documentBId, conversation.id)).length, 0);

  await assert.rejects(
    () => prisma.$executeRaw`
      INSERT INTO "conversations" ("id", "documentId", "createdAt", "updatedAt")
      VALUES (${shareId}::uuid, ${documentAId}::uuid, ${fixedDate}, ${fixedDate})
    `,
    /conversations_principal_check/i,
  );

  await prisma.document.delete({ where: { id: documentAId } });
  assert.equal(await prisma.documentChunk.count({ where: { documentId: documentAId } }), 0);
  assert.equal(await prisma.conversation.count({ where: { documentId: documentAId } }), 0);
  assert.equal(await prisma.message.count({ where: { conversationId: conversation.id } }), 0);

  console.log('AI foundation integration checks: OK');
}

try {
  await main();
} finally {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
}
