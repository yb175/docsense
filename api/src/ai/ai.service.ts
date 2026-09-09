import { DocumentProcessingStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { createChunkSummaryModel, createFinalSummaryModel, createVisionModel } from './models/llm.js';
import { generateAndPersistDocumentSummary } from '../services/summary.service.js';
import { generateDocumentSummary, type SummaryModel } from './chains/summary.chain.js';
import { createEmbeddingModel, embedDocuments, embedQuery, type EmbeddingModel } from './models/embeddings.js';
import { persistChunkEmbeddings } from '../services/ai-persistence.service.js';
import { retrieveForQuestion, type RetrievedChunk } from './retrieval/retriever.js';
import { buildRagContext, type ConversationMessage, type RagContext } from './context/context-builder.js';
import { extractUnifiedText, type UnifiedTextResult } from './loaders/vlm-loader.js';
import { splitUnifiedText, type DocumentChunkInput, type DocumentSplitterOptions } from './splitters/document-splitter.js';
import { downloadPdfBytes } from '../storage/s3.service.js';

const activeDocuments = new Set<string>();
const MAX_DOCUMENT_CHUNKS = 500;
const EMBEDDING_BATCH_SIZE = 50;

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
    await prisma.documentChunk.deleteMany({ where: { documentId } });
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
    await prisma.documentChunk.deleteMany({ where: { documentId } }).catch((cleanupError) => console.error(`[ai:pipeline] document=${documentId} failed-to-clean-chunks`, cleanupError));
    await prisma.document.updateMany({
      where: { id: documentId, processingStatus: DocumentProcessingStatus.PROCESSING },
      data: { processingStatus: DocumentProcessingStatus.FAILED },
    }).catch((updateError) => console.error(`[ai:pipeline] document=${documentId} failed-to-record-failure`, updateError));
    console.error(`[ai:pipeline] document=${documentId} status=FAILED`, error);
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
  if (chunks.length > MAX_DOCUMENT_CHUNKS) throw new Error(`Document exceeds the ${MAX_DOCUMENT_CHUNKS}-chunk processing limit`);
  for (let index = 0; index < chunks.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(index, index + EMBEDDING_BATCH_SIZE);
    await persistChunkEmbeddings(batch, await embedDocuments(batch.map((chunk) => chunk.text), model));
  }
}

export async function resumeDocumentProcessing(): Promise<void> {
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
  const documents = await prisma.document.findMany({
    where: {
      OR: [
        { processingStatus: DocumentProcessingStatus.PENDING },
        { processingStatus: DocumentProcessingStatus.PROCESSING, updatedAt: { lt: staleBefore } },
      ],
    },
    select: { id: true, storageKey: true },
  });
  for (const document of documents) {
    if (activeDocuments.has(document.id)) continue;
    const claimed = await prisma.document.updateMany({
      where: {
        id: document.id,
        OR: [
          { processingStatus: DocumentProcessingStatus.PENDING },
          { processingStatus: DocumentProcessingStatus.PROCESSING, updatedAt: { lt: staleBefore } },
        ],
      },
      data: { processingStatus: DocumentProcessingStatus.PROCESSING },
    });
    if (claimed.count !== 1) continue;
    void downloadPdfBytes(document.storageKey)
      .then((bytes) => processDocument(document.id, bytes))
      .catch(async (error) => {
        await prisma.document.updateMany({
          where: { id: document.id, processingStatus: DocumentProcessingStatus.PROCESSING },
          data: { processingStatus: DocumentProcessingStatus.FAILED },
        });
        console.error(`[ai:pipeline] document=${document.id} status=FAILED resume`, error);
      });
  }
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
