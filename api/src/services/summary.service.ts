import { DocumentProcessingStatus } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { generateDocumentSummary, type SummaryModel } from '../ai/chains/summary.chain.js';
import { createChunkSummaryModel, createFinalSummaryModel } from '../ai/models/llm.js';

export async function generateAndPersistDocumentSummary(input: {
  documentId: string;
  chunkModel?: SummaryModel;
  finalModel?: SummaryModel;
}) {
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
    return result;
  } catch (error) {
    await prisma.document.update({
      where: { id: input.documentId },
      data: { processingStatus: DocumentProcessingStatus.FAILED },
    }).catch(() => undefined);
    throw error;
  }
}
