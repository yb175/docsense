import { createChunkSummaryModel, createFinalSummaryModel, createVisionModel } from './models/llm.js';
import { generateAndPersistDocumentSummary } from '../services/summary.service.js';
import { generateDocumentSummary, type SummaryModel } from './chains/summary.chain.js';
import { createEmbeddingModel, embedDocuments, embedQuery, type EmbeddingModel } from './models/embeddings.js';
import { persistChunkEmbeddings } from '../services/ai-persistence.service.js';
import { retrieveForQuestion, type RetrievedChunk } from './retrieval/retriever.js';
import { extractUnifiedText, type UnifiedTextResult } from './loaders/vlm-loader.js';
import { splitUnifiedText, type DocumentChunkInput, type DocumentSplitterOptions } from './splitters/document-splitter.js';

export async function extractUnifiedPdfText(bytes: Uint8Array) {
  return extractUnifiedText(bytes, createVisionModel());
}

export async function embedAndStoreDocumentChunks(
  chunks: DocumentChunkInput[],
  model: EmbeddingModel = createEmbeddingModel(),
): Promise<void> {
  await persistChunkEmbeddings(chunks, await embedDocuments(chunks.map((chunk) => chunk.text), model));
}

export async function embedUserQuestion(question: string, model: EmbeddingModel = createEmbeddingModel()): Promise<number[]> {
  return embedQuery(question, model);
}

export async function retrieveDocumentContext(input: {
  documentId: string;
  question: string;
  model?: EmbeddingModel;
  topK?: number;
  minSimilarity?: number;
}): Promise<RetrievedChunk[]> {
  return retrieveForQuestion({ ...input, model: input.model ?? createEmbeddingModel() });
}

export async function summarizeDocumentChunks(
  chunks: Array<{ text: string; pageStart?: number | null; pageEnd?: number | null }>,
  chunkModel: SummaryModel = createChunkSummaryModel(),
  finalModel: SummaryModel = createFinalSummaryModel(),
) {
  return generateDocumentSummary(chunkModel, finalModel, chunks);
}

export async function generateAndPersistSummary(documentId: string) {
  return generateAndPersistDocumentSummary({ documentId });
}

export async function chunkUnifiedPdfText(
  documentId: string,
  unifiedText: UnifiedTextResult,
  options?: DocumentSplitterOptions,
): Promise<DocumentChunkInput[]> {
  return splitUnifiedText(documentId, unifiedText, options);
}
