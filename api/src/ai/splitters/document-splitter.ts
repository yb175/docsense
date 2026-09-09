import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import type { UnifiedTextResult } from '../loaders/vlm-loader.js';

export const DEFAULT_CHUNK_SIZE = 1200;
export const DEFAULT_CHUNK_OVERLAP = 200;

export type DocumentChunkInput = {
  documentId: string;
  chunkIndex: number;
  text: string;
  pageStart: number;
  pageEnd: number;
};

export type DocumentSplitterOptions = {
  chunkSize?: number;
  chunkOverlap?: number;
};

export async function splitUnifiedText(
  documentId: string,
  unifiedText: UnifiedTextResult,
  options: DocumentSplitterOptions = {},
): Promise<DocumentChunkInput[]> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) throw new Error('chunkSize must be a positive integer');
  if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0 || chunkOverlap >= chunkSize) {
    throw new Error('chunkOverlap must be a non-negative integer smaller than chunkSize');
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ['\n\n', '\n', ' ', ''],
  });
  const chunks: DocumentChunkInput[] = [];

  for (const page of unifiedText.pages) {
    if (!page.text.trim()) continue;
    const documents = await splitter.splitDocuments([
      new Document({
        pageContent: page.text,
        metadata: { pageStart: page.pageNumber, pageEnd: page.pageNumber },
      }),
    ]);
    for (const document of documents) {
      const text = document.pageContent.trim();
      if (!text) continue;
      chunks.push({
        documentId,
        chunkIndex: chunks.length,
        text,
        pageStart: page.pageNumber,
        pageEnd: page.pageNumber,
      });
    }
  }

  return chunks;
}
