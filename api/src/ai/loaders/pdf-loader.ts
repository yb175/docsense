import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export const MIN_EXTRACTED_WORDS = 8;

export type PageExtraction = {
  pageNumber: number;
  text: string;
  characterCount: number;
  wordCount: number;
  needsVisualFallback: boolean;
};

export type PdfExtractionResult = {
  pageCount: number;
  pages: PageExtraction[];
  text: string;
};

export class PdfExtractionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PdfExtractionError';
  }
}

function wordCount(text: string): number {
  return text ? text.split(/\s+/u).filter(Boolean).length : 0;
}

function pageNeedsVisualFallback(text: string, words: number): boolean {
  return words < MIN_EXTRACTED_WORDS;
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfExtractionResult> {
  if (bytes.length === 0) throw new PdfExtractionError('PDF is empty');

  let document: pdfjs.PDFDocumentProxy;
  try {
    const data = new Uint8Array(bytes);
    document = await pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  } catch (error) {
    throw new PdfExtractionError('Unable to parse PDF', { cause: error });
  }

  try {
    if (document.numPages === 0) throw new PdfExtractionError('PDF contains no pages');

    const pages: PageExtraction[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      let textContent: Awaited<ReturnType<pdfjs.PDFPageProxy['getTextContent']>>;
      try {
        textContent = await (await document.getPage(pageNumber)).getTextContent();
      } catch (error) {
        throw new PdfExtractionError(`Unable to extract page ${pageNumber}`, { cause: error });
      }

      const text = textContent.items
        .flatMap((item) => 'str' in item && typeof item.str === 'string' ? [item.str] : [])
        .join(' ')
        .replace(/\s+/gu, ' ')
        .trim();
      const words = wordCount(text);

      pages.push({
        pageNumber,
        text,
        characterCount: text.length,
        wordCount: words,
        needsVisualFallback: pageNeedsVisualFallback(text, words),
      });
    }

    return {
      pageCount: pages.length,
      pages,
      text: pages.map((page) => `Page ${page.pageNumber}:\n${page.text}`).join('\n\n'),
    };
  } finally {
    await document.cleanup();
  }
}
