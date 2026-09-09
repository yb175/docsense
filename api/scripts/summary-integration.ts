import assert from 'node:assert/strict';
import { DocumentProcessingStatus } from '@prisma/client';

import { prisma } from '../src/db/prisma.js';
import { generateAndPersistDocumentSummary } from '../src/services/summary.service.js';
import type { SummaryModel } from '../src/ai/chains/summary.chain.js';

const userId = '00000000-0000-4000-8000-000000000021';
const documentId = '00000000-0000-4000-8000-000000000022';

const chunkModel: SummaryModel = {
  async invoke() {
    return { content: 'The supplied chunk states a grounded fact.' };
  },
};
const finalModel: SummaryModel = {
  async invoke() {
    return { content: 'The document describes a grounded agreement. It includes the supplied commercial terms. It also defines the relevant obligations.' };
  },
};

async function main() {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.user.create({
    data: { id: userId, name: 'Summary Test User', email: 'summary@example.test', passwordHash: 'not-used', emailVerified: true },
  });
  await prisma.document.create({
    data: {
      id: documentId,
      ownerId: userId,
      filename: 'summary.pdf',
      normalizedFilename: 'summary.pdf',
      storageKey: `test/${documentId}.pdf`,
      sizeBytes: 1,
      mimeType: 'application/pdf',
    },
  });
  await prisma.documentChunk.createMany({
    data: [
      { documentId, chunkIndex: 0, text: 'Revenue was $10 million.', pageStart: 1, pageEnd: 1 },
      { documentId, chunkIndex: 1, text: 'The contract renews annually.', pageStart: 2, pageEnd: 2 },
    ],
  });

  const result = await generateAndPersistDocumentSummary({ documentId, chunkModel, finalModel });
  assert.equal(result.chunkSummaries.length, 2);
  assert.equal((await prisma.document.findUnique({ where: { id: documentId }, select: { aiSummary: true, processingStatus: true } }))?.processingStatus, DocumentProcessingStatus.COMPLETED);
  assert.match((await prisma.document.findUnique({ where: { id: documentId }, select: { aiSummary: true } }))?.aiSummary ?? '', /grounded agreement/);

  await assert.rejects(
    () => generateAndPersistDocumentSummary({
      documentId,
      chunkModel,
      finalModel: { async invoke() { return { content: 'One sentence.' }; } },
    }),
  );
  assert.equal((await prisma.document.findUnique({ where: { id: documentId }, select: { processingStatus: true } }))?.processingStatus, DocumentProcessingStatus.FAILED);

  console.log('Summary integration checks: OK');
}

try {
  await main();
} finally {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
}
