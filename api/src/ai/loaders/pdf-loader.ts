import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export const MIN_EXTRACTED_WORDS = 8;
export const MAX_PDF_PAGES = 200;
export const MAX_RENDER_DIMENSION = 4096;
export const MAX_RENDER_PIXELS = 16_000_000;
export const MAX_RENDERED_PNG_BYTES = 10 * 1024 * 1024;

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

export async function renderPdfPage(bytes: Uint8Array, pageNumber: number): Promise<Uint8Array> {
  if (bytes.length === 0) throw new PdfExtractionError('PDF is empty');

  let document: pdfjs.PDFDocumentProxy;
  try {
    document = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 }).promise;
  } catch (error) {
    throw new PdfExtractionError('Unable to parse PDF', { cause: error });
  }

  try {
    if (pageNumber < 1 || pageNumber > document.numPages) {
      throw new PdfExtractionError(`PDF page ${pageNumber} does not exist`);
    }
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    if (width > MAX_RENDER_DIMENSION || height > MAX_RENDER_DIMENSION || width * height > MAX_RENDER_PIXELS) {
      throw new PdfExtractionError('PDF page exceeds the visual-analysis rendering limit');
    }
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context as never, canvas: canvas as never, viewport }).promise;
    const image = canvas.toBuffer('image/png');
    if (image.length > MAX_RENDERED_PNG_BYTES) throw new PdfExtractionError('Rendered PDF page exceeds the visual-analysis size limit');
    return image;
  } catch (error) {
    if (error instanceof PdfExtractionError) throw error;
    throw new PdfExtractionError(`Unable to render page ${pageNumber}`, { cause: error });
  } finally {
    await document.cleanup();
  }
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
    if (document.numPages > MAX_PDF_PAGES) throw new PdfExtractionError(`PDF exceeds the ${MAX_PDF_PAGES}-page processing limit`);

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
