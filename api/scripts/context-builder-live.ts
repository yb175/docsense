import assert from 'node:assert/strict';

import { prisma } from '../src/db/prisma.js';
import { buildDocumentChatContext, embedAndStoreDocumentChunks } from '../src/ai/ai.service.js';
import { createEmbeddingModel } from '../src/ai/models/embeddings.js';
import type { DocumentChunkInput } from '../src/ai/splitters/document-splitter.js';

const userId = '00000000-0000-4000-8000-000000000041';
const documentId = '00000000-0000-4000-8000-000000000042';

async function main() {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.user.create({ data: { id: userId, name: 'RAG Live Test', email: 'rag-live@example.test', passwordHash: 'not-used', emailVerified: true } });
  await prisma.document.create({ data: { id: documentId, ownerId: userId, filename: 'rag-live.pdf', normalizedFilename: 'rag-live.pdf', storageKey: `test/${documentId}.pdf`, sizeBytes: 1, mimeType: 'application/pdf' } });

  const chunks: DocumentChunkInput[] = [
    { documentId, chunkIndex: 0, text: 'The agreement records annual revenue of ten million dollars.', pageStart: 1, pageEnd: 1 },
    { documentId, chunkIndex: 1, text: 'The renewal term is twelve months.', pageStart: 2, pageEnd: 2 },
  ];
  const model = createEmbeddingModel();
  await embedAndStoreDocumentChunks(chunks, model);
  const context = await buildDocumentChatContext({
    documentId,
    question: 'What revenue does the agreement record?',
    model,
    conversation: [{ role: 'user', content: 'Tell me about this agreement.' }],
    topK: 2,
  });
  assert.equal(context.hasDocumentContext, true);
  assert.equal(context.chunks.every((chunk) => chunk.documentId === documentId), true);
  assert.match(context.pdfContext, /annual revenue/);
  assert.match(context.conversationContext, /Tell me about this agreement/);
  console.log(JSON.stringify({ embeddedChunks: chunks.length, retrievedChunks: context.chunks.length, documentScoped: true, contextBuilt: true }));
}

try {
  await main();
} finally {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
}
