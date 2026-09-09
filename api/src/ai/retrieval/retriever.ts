import { assertEmbedding, embedQuery, type EmbeddingModel } from '../models/embeddings.js';
import { prisma } from '../../db/prisma.js';

export const DEFAULT_MIN_SIMILARITY = 0.2;

export type RetrievedChunk = {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
  similarity: number;
};

function vectorLiteral(embedding: number[]): string {
  assertEmbedding(embedding);
  return `[${embedding.join(',')}]`;
}

export async function retrieveDocumentChunks(input: {
  documentId: string;
  queryEmbedding: number[];
  topK?: number;
  minSimilarity?: number;
}): Promise<RetrievedChunk[]> {
  const topK = input.topK ?? 5;
  if (!Number.isInteger(topK) || topK < 1 || topK > 50) throw new Error('topK must be an integer between 1 and 50');
  const minSimilarity = input.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  if (minSimilarity < -1 || minSimilarity > 1) throw new Error('minSimilarity must be between -1 and 1');
  const vector = vectorLiteral(input.queryEmbedding);

  const rows = await prisma.$queryRaw<Array<Omit<RetrievedChunk, 'similarity'> & { similarity: number }>>`
    SELECT
      "id",
      "documentId",
      "chunkIndex",
      "text",
      "pageStart",
      "pageEnd",
      1 - ("embedding" <=> ${vector}::vector) AS "similarity"
    FROM "document_chunks"
    WHERE "documentId" = ${input.documentId}::uuid
      AND "embedding" IS NOT NULL
      AND 1 - ("embedding" <=> ${vector}::vector) >= ${minSimilarity}
    ORDER BY "embedding" <=> ${vector}::vector ASC
    LIMIT ${topK}
  `;
  return rows.map((row) => ({ ...row, similarity: Number(row.similarity) }));
}

export async function retrieveForQuestion(input: {
  documentId: string;
  question: string;
  model: EmbeddingModel;
  topK?: number;
  minSimilarity?: number;
}): Promise<RetrievedChunk[]> {
  return retrieveDocumentChunks({
    documentId: input.documentId,
    queryEmbedding: await embedQuery(input.question, input.model),
    topK: input.topK,
    minSimilarity: input.minSimilarity,
  });
}
