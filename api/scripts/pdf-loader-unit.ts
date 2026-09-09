import assert from 'node:assert/strict';

import { extractPdfText, PdfExtractionError } from '../src/ai/loaders/pdf-loader.js';

function buildPdf(pages: string[]): Buffer {
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ];

  for (let index = 0; index < pages.length; index += 1) {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const escaped = pages[index]!.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
    const content = `BT /F1 12 Tf 20 250 Td (${escaped}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentObject} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    );
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const header = '%PDF-1.7\n';
  let body = header;
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body);
}

const normal = await extractPdfText(buildPdf([
  'This is a sufficiently long text page for extraction testing.',
]));
assert.equal(normal.pageCount, 1);
assert.equal(normal.pages[0]?.pageNumber, 1);
assert.match(normal.pages[0]?.text ?? '', /sufficiently long text page/);
assert.equal(normal.pages[0]?.needsVisualFallback, false);
assert.match(normal.text, /^Page 1:/);

const multiPage = await extractPdfText(buildPdf([
  'The first page contains the opening agreement terms and parties.',
  'The second page contains payment obligations, dates, and termination rights.',
]));
assert.equal(multiPage.pageCount, 2);
assert.deepEqual(multiPage.pages.map((page) => page.pageNumber), [1, 2]);
assert.match(multiPage.text, /Page 1:[\s\S]*Page 2:/);

const emptyPage = await extractPdfText(buildPdf(['']));
assert.equal(emptyPage.pages[0]?.text, '');
assert.equal(emptyPage.pages[0]?.needsVisualFallback, true);

await assert.rejects(
  () => extractPdfText(Buffer.alloc(0)),
  (error: unknown) => error instanceof PdfExtractionError && error.message === 'PDF is empty',
);
await assert.rejects(
  () => extractPdfText(Buffer.from('not a PDF')),
  (error: unknown) => error instanceof PdfExtractionError && error.message === 'Unable to parse PDF',
);

console.log('PDF loader unit checks: OK');
