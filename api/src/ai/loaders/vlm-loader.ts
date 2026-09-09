import { HumanMessage } from '@langchain/core/messages';

import { visualPagePrompt } from '../prompts/summary.prompt.js';
import { extractPdfText, renderPdfPage, type PageExtraction, type PdfExtractionResult } from './pdf-loader.js';

export const MAX_VISUAL_FALLBACK_PAGES = 10;

export type VisualModel = {
  invoke(input: HumanMessage[]): Promise<{ content: unknown }>;
};

export type UnifiedPage = PageExtraction & {
  visualDescription?: string;
  source: 'pdf' | 'vlm' | 'pdf+vlm';
};

export type UnifiedTextResult = Omit<PdfExtractionResult, 'pages' | 'text'> & {
  pages: UnifiedPage[];
  text: string;
};

export class VlmExtractionError extends Error {
  constructor(pageNumber: number, options?: ErrorOptions) {
    super(`Unable to analyze visual content on page ${pageNumber}`, options);
    this.name = 'VlmExtractionError';
  }
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((part) => typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string' ? [part.text] : [])
    .join('\n')
    .trim();
}

export async function analyzeVisualPage(model: VisualModel, image: Uint8Array, pageNumber: number): Promise<string> {
  try {
    const response = await model.invoke([new HumanMessage({
      content: [
        { type: 'text', text: visualPagePrompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from(image).toString('base64')}` } },
      ],
    })]);
    const text = contentText(response.content);
    if (!text) throw new Error('VLM returned empty content');
    return text;
  } catch (error) {
    throw new VlmExtractionError(pageNumber, { cause: error });
  }
}

export async function buildUnifiedText(
  bytes: Uint8Array,
  extraction: PdfExtractionResult,
  model: VisualModel,
): Promise<UnifiedTextResult> {
  const pages: UnifiedPage[] = [];
  let visualPages = 0;
  for (const page of extraction.pages) {
    if (!page.needsVisualFallback) {
      pages.push({ ...page, source: 'pdf' });
      continue;
    }

    if (++visualPages > MAX_VISUAL_FALLBACK_PAGES) {
      throw new VlmExtractionError(page.pageNumber, { cause: new Error(`PDF exceeds the ${MAX_VISUAL_FALLBACK_PAGES}-page visual-analysis limit`) });
    }
    const image = await renderPdfPage(bytes, page.pageNumber);
    const visualDescription = await analyzeVisualPage(model, image, page.pageNumber);
    const text = [page.text, visualDescription].filter(Boolean).join('\n');
    pages.push({
      ...page,
      text,
      characterCount: text.length,
      wordCount: text.split(/\s+/u).filter(Boolean).length,
      visualDescription,
      source: page.text ? 'pdf+vlm' : 'vlm',
      needsVisualFallback: false,
    });
  }

  return {
    pageCount: pages.length,
    pages,
    text: pages.map((page) => `Page ${page.pageNumber}:\n${page.text}`).join('\n\n'),
  };
}

export async function extractUnifiedText(bytes: Uint8Array, model: VisualModel): Promise<UnifiedTextResult> {
  return buildUnifiedText(bytes, await extractPdfText(bytes), model);
}
