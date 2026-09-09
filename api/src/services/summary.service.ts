import { DocumentProcessingStatus } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { generateDocumentSummary, type SummaryModel } from '../ai/chains/summary.chain.js';
import { createChunkSummaryModel, createFinalSummaryModel } from '../ai/models/llm.js';

export async function generateAndPersistDocumentSummary(input: {
  documentId: string;
  chunkModel?: SummaryModel;
  finalModel?: SummaryModel;
}) {
  console.info(`[ai:summary] document=${input.documentId} status=PROCESSING`);
  await prisma.document.update({
    where: { id: input.documentId },
    data: { processingStatus: DocumentProcessingStatus.PROCESSING },
  });

  try {
    const chunks = await prisma.documentChunk.findMany({
      where: { documentId: input.documentId },
      orderBy: { chunkIndex: 'asc' },
      select: { text: true, pageStart: true, pageEnd: true },
    });
    console.info(`[ai:summary] document=${input.documentId} chunks=${chunks.length} generating`);
    const result = await generateDocumentSummary(
      input.chunkModel ?? createChunkSummaryModel(),
      input.finalModel ?? createFinalSummaryModel(),
      chunks,
    );
    await prisma.document.update({
      where: { id: input.documentId },
      data: {
        aiSummary: result.finalSummary,
        processingStatus: DocumentProcessingStatus.COMPLETED,
      },
    });
    console.info(`[ai:summary] document=${input.documentId} status=COMPLETED`);
    return result;
  } catch (error) {
    console.error(`[ai:summary] document=${input.documentId} status=FAILED`, error);
    await prisma.document.update({
      where: { id: input.documentId },
      data: { processingStatus: DocumentProcessingStatus.FAILED },
    }).catch(() => undefined);
    throw error;
  }
}
