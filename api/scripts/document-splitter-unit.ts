import assert from 'node:assert/strict';

import { splitUnifiedText } from '../src/ai/splitters/document-splitter.js';
import type { UnifiedTextResult } from '../src/ai/loaders/vlm-loader.js';

function unifiedText(pages: string[]): UnifiedTextResult {
  return {
    pageCount: pages.length,
    pages: pages.map((text, index) => ({
      pageNumber: index + 1,
      text,
      characterCount: text.length,
      wordCount: text.split(/\s+/u).filter(Boolean).length,
      needsVisualFallback: false,
      source: 'pdf' as const,
    })),
    text: pages.map((text, index) => `Page ${index + 1}:\n${text}`).join('\n\n'),
  };
}

const documentId = '00000000-0000-4000-8000-000000000001';
const small = await splitUnifiedText(documentId, unifiedText(['A short page with useful text.']));
assert.equal(small.length, 1);
assert.deepEqual(small[0], {
  documentId,
  chunkIndex: 0,
  text: 'A short page with useful text.',
  pageStart: 1,
  pageEnd: 1,
});

const repeated = Array.from({ length: 500 }, (_, index) => `word${index}`).join(' ');
const large = await splitUnifiedText(documentId, unifiedText([repeated]), { chunkSize: 100, chunkOverlap: 20 });
assert.ok(large.length > 1);
assert.equal(large.every((chunk) => chunk.text.length <= 100), true);
assert.equal(large.every((chunk, index) => chunk.chunkIndex === index), true);
assert.equal(large.some((chunk, index) => index > 0 && large[index - 1]!.text.slice(-20).split(/\s+/u).some((word) => word && chunk.text.includes(word))), true);

const pages = await splitUnifiedText(documentId, unifiedText([
  'First page text with enough content for one chunk.',
  'Second page text with enough content for another chunk.',
]), { chunkSize: 200, chunkOverlap: 20 });
assert.deepEqual(pages.map(({ chunkIndex, pageStart, pageEnd }) => ({ chunkIndex, pageStart, pageEnd })), [
  { chunkIndex: 0, pageStart: 1, pageEnd: 1 },
  { chunkIndex: 1, pageStart: 2, pageEnd: 2 },
]);

const repeatedResult = await splitUnifiedText(documentId, unifiedText([repeated]), { chunkSize: 100, chunkOverlap: 20 });
assert.deepEqual(repeatedResult, large);
assert.deepEqual(await splitUnifiedText(documentId, unifiedText([''])), []);

await assert.rejects(() => splitUnifiedText(documentId, unifiedText(['text']), { chunkSize: 0 }), /chunkSize/);
await assert.rejects(() => splitUnifiedText(documentId, unifiedText(['text']), { chunkSize: 10, chunkOverlap: 10 }), /chunkOverlap/);

console.log('Document splitter unit checks: OK');
