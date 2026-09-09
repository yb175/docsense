import { createVisionModel } from './models/llm.js';
import { extractUnifiedText } from './loaders/vlm-loader.js';

export async function extractUnifiedPdfText(bytes: Uint8Array) {
  return extractUnifiedText(bytes, createVisionModel());
}
