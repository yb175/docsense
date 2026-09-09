import assert from 'node:assert/strict';

import { extractPdfText } from '../src/ai/loaders/pdf-loader.js';
import { buildUnifiedText, VlmExtractionError, type VisualModel } from '../src/ai/loaders/vlm-loader.js';

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
  let body = '%PDF-1.7\n';
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

const normalBytes = buildPdf(['This page contains enough extracted text to bypass visual analysis.']);
const normalExtraction = await extractPdfText(normalBytes);
let calls = 0;
const model: VisualModel = {
  async invoke(input) {
    calls += 1;
    assert.equal(input.length, 1);
    const content = input[0]?.content;
    assert.ok(Array.isArray(content));
    assert.equal(content.some((part) => typeof part === 'object' && part !== null && 'image_url' in part), true);
    return { content: 'A chart shows revenue increasing from 10 to 20 million.' };
  },
};

const normalUnified = await buildUnifiedText(normalBytes, normalExtraction, model);
assert.equal(calls, 0);
assert.equal(normalUnified.pages[0]?.source, 'pdf');

const visualBytes = buildPdf(['']);
const visualUnified = await buildUnifiedText(visualBytes, await extractPdfText(visualBytes), model);
assert.equal(calls, 1);
assert.equal(visualUnified.pages[0]?.source, 'vlm');
assert.match(visualUnified.pages[0]?.text ?? '', /revenue increasing/);
assert.match(visualUnified.text, /^Page 1:/);

const visualExtraction = await extractPdfText(visualBytes);
await assert.rejects(
  () => buildUnifiedText(visualBytes, visualExtraction, {
    async invoke() {
      throw new Error('provider timeout');
    },
  }),
  (error: unknown) => error instanceof VlmExtractionError && error.message.includes('page 1'),
);

console.log('VLM loader unit checks: OK');
