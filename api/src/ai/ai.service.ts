import { DocumentProcessingStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { createChunkSummaryModel, createFinalSummaryModel, createVisionModel } from './models/llm.js';
import { generateAndPersistDocumentSummary } from '../services/summary.service.js';
import { removeDocument } from '../services/document.service.js';
import { generateDocumentSummary, type SummaryModel } from './chains/summary.chain.js';
import { createEmbeddingModel, embedDocuments, embedQuery, type EmbeddingModel } from './models/embeddings.js';
import { persistChunkEmbeddings } from '../services/ai-persistence.service.js';
import { retrieveForQuestion, type RetrievedChunk } from './retrieval/retriever.js';
import { buildRagContext, type ConversationMessage, type RagContext } from './context/context-builder.js';
import { extractUnifiedText, type UnifiedTextResult } from './loaders/vlm-loader.js';
import { splitUnifiedText, type DocumentChunkInput, type DocumentSplitterOptions } from './splitters/document-splitter.js';

const activeDocuments = new Set<string>();

export async function startDocumentProcessing(documentId: string): Promise<boolean> {
  const started = await prisma.document.updateMany({
    where: { id: documentId, processingStatus: DocumentProcessingStatus.PENDING },
    data: { processingStatus: DocumentProcessingStatus.PROCESSING },
  });
  return started.count === 1;
}

export async function processDocument(documentId: string, bytes: Uint8Array): Promise<void> {
  if (activeDocuments.has(documentId)) {
    console.info(`[ai:pipeline] document=${documentId} skipped=already-active`);
    return;
  }
  activeDocuments.add(documentId);
  console.info(`[ai:pipeline] document=${documentId} status=PROCESSING`);
  try {
    const unifiedText = await extractUnifiedPdfText(bytes);
    console.info(`[ai:pipeline] document=${documentId} pages=${unifiedText.pages.length} extracted`);
    const chunks = await chunkUnifiedPdfText(documentId, unifiedText);
    console.info(`[ai:pipeline] document=${documentId} chunks=${chunks.length} split`);
    if (!chunks.length) throw new Error('No readable text was found in the PDF');
    await embedAndStoreDocumentChunks(chunks);
    console.info(`[ai:pipeline] document=${documentId} embeddings=stored`);
    await generateAndPersistSummary(documentId);
    console.info(`[ai:pipeline] document=${documentId} status=COMPLETED`);
  } catch (error) {
    await removeDocument(documentId).catch((cleanupError) => console.error(`[ai:cleanup] document=${documentId} failed`, cleanupError));
    console.error(`[ai:pipeline] document=${documentId} status=FAILED_REMOVED`, error);
  } finally {
    activeDocuments.delete(documentId);
  }
}

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

export async function buildDocumentChatContext(input: {
  documentId: string;
  question: string;
  retrievalQuestion?: string;
  conversation?: ConversationMessage[];
  documentSummary?: string | null;
  previousAssistantResponse?: string;
  intent?: import('./context/context-builder.js').ChatIntent;
  model?: EmbeddingModel;
  topK?: number;
  minSimilarity?: number;
}): Promise<RagContext> {
  const chunks = await retrieveDocumentContext({ ...input, question: input.retrievalQuestion ?? input.question });
  return buildRagContext({
    question: input.question,
    chunks,
    conversation: input.conversation,
    documentSummary: input.documentSummary,
    previousAssistantResponse: input.previousAssistantResponse,
    intent: input.intent,
  });
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
