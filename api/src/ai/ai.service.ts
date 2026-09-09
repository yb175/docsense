import { createVisionModel } from './models/llm.js';
import { extractUnifiedText, type UnifiedTextResult } from './loaders/vlm-loader.js';
import { splitUnifiedText, type DocumentChunkInput, type DocumentSplitterOptions } from './splitters/document-splitter.js';

export async function extractUnifiedPdfText(bytes: Uint8Array) {
  return extractUnifiedText(bytes, createVisionModel());
}

export async function chunkUnifiedPdfText(
  documentId: string,
  unifiedText: UnifiedTextResult,
  options?: DocumentSplitterOptions,
): Promise<DocumentChunkInput[]> {
  return splitUnifiedText(documentId, unifiedText, options);
}
