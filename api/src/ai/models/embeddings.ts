import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

import { env } from '../../lib/env.js';

export const EMBEDDING_DIMENSION = 3072;

export type EmbeddingModel = {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
};

export function createEmbeddingModel(): EmbeddingModel {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for embeddings');
  return new GoogleGenerativeAIEmbeddings({
    apiKey: env.GEMINI_API_KEY,
    model: env.AI_EMBEDDING_MODEL,
    stripNewLines: true,
  });
}

export function assertEmbedding(embedding: number[]): void {
  if (embedding.length !== EMBEDDING_DIMENSION || embedding.some((value) => !Number.isFinite(value))) {
    throw new Error(`Embedding must contain exactly ${EMBEDDING_DIMENSION} finite values`);
  }
}

export async function embedDocuments(texts: string[], model: EmbeddingModel = createEmbeddingModel()): Promise<number[][]> {
  const embeddings = await model.embedDocuments(texts);
  if (embeddings.length !== texts.length) throw new Error('Embedding provider returned an unexpected result count');
  embeddings.forEach(assertEmbedding);
  return embeddings;
}

export async function embedQuery(question: string, model: EmbeddingModel = createEmbeddingModel()): Promise<number[]> {
  const embedding = await model.embedQuery(question);
  assertEmbedding(embedding);
  return embedding;
}
