import assert from 'node:assert/strict';

import { prisma } from '../src/db/prisma.js';
import { assertTestDatabase } from './test-db.js';
import { EMBEDDING_DIMENSION } from '../src/ai/models/embeddings.js';
import { persistChunkEmbeddings } from '../src/services/ai-persistence.service.js';
import { retrieveDocumentChunks } from '../src/ai/retrieval/retriever.js';
import type { DocumentChunkInput } from '../src/ai/splitters/document-splitter.js';

const userId = '00000000-0000-4000-8000-000000000011';
const documentAId = '00000000-0000-4000-8000-000000000012';
const documentBId = '00000000-0000-4000-8000-000000000013';

function vector(axis: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => index === axis ? 1 : 0);
}

async function main() {
  assertTestDatabase();
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.user.create({
    data: {
      id: userId,
      name: 'Embedding Test User',
      email: 'embedding@example.test',
      passwordHash: 'not-used',
      emailVerified: true,
    },
  });
  await prisma.document.createMany({
    data: [
      { id: documentAId, ownerId: userId, filename: 'embedding-a.pdf', normalizedFilename: 'embedding-a.pdf', storageKey: `test/${documentAId}.pdf`, sizeBytes: 1, mimeType: 'application/pdf' },
      { id: documentBId, ownerId: userId, filename: 'embedding-b.pdf', normalizedFilename: 'embedding-b.pdf', storageKey: `test/${documentBId}.pdf`, sizeBytes: 1, mimeType: 'application/pdf' },
    ],
  });

  const chunksA: DocumentChunkInput[] = [
    { documentId: documentAId, chunkIndex: 0, text: 'Apple revenue was $10 million.', pageStart: 1, pageEnd: 1 },
    { documentId: documentAId, chunkIndex: 1, text: 'The contract renews annually.', pageStart: 2, pageEnd: 2 },
  ];
  const chunksB: DocumentChunkInput[] = [
    { documentId: documentBId, chunkIndex: 0, text: 'Apple revenue was $20 million.', pageStart: 1, pageEnd: 1 },
  ];
  await persistChunkEmbeddings([...chunksA, ...chunksB], [vector(0), vector(1), vector(0)]);
  await persistChunkEmbeddings([chunksA[0]!], [vector(0)]); // retry is an upsert, not a duplicate

  const storedCount = await prisma.documentChunk.count({ where: { documentId: documentAId } });
  assert.equal(storedCount, 2);

  const relevant = await retrieveDocumentChunks({ documentId: documentAId, queryEmbedding: vector(0), topK: 2, minSimilarity: 0.5 });
  assert.equal(relevant.length, 1);
  assert.equal(relevant[0]?.text, 'Apple revenue was $10 million.');
  assert.equal(relevant[0]?.documentId, documentAId);
  assert.equal(relevant[0]?.pageStart, 1);

  const unrelated = await retrieveDocumentChunks({ documentId: documentAId, queryEmbedding: vector(2), topK: 5, minSimilarity: 0.5 });
  assert.deepEqual(unrelated, []);

  const isolated = await retrieveDocumentChunks({ documentId: documentAId, queryEmbedding: vector(0), topK: 5 });
  assert.equal(isolated.length, 1);
  assert.equal(isolated.every((chunk) => chunk.documentId === documentAId), true);
  assert.equal(isolated.some((chunk) => chunk.text.includes('$20 million')), false);

  console.log('Embedding retrieval integration checks: OK');
}

try {
  await main();
} finally {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
}
