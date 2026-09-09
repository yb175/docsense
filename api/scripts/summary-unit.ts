import assert from 'node:assert/strict';

import { generateDocumentSummary, generateFinalSummary, SummaryGenerationError, sentenceCount, type SummaryModel } from '../src/ai/chains/summary.chain.js';

const chunkCalls: string[] = [];
const chunkModel: SummaryModel = {
  async invoke(messages) {
    chunkCalls.push(String(messages[1]?.content ?? ''));
    return { content: 'The chunk states that revenue was $10 million.' };
  },
};
const finalModel: SummaryModel = {
  async invoke(messages) {
    assert.match(String(messages[1]?.content ?? ''), /Chunk 1:/);
    return { content: 'The document defines the commercial relationship. It records revenue of $10 million. It establishes annual renewal terms.' };
  },
};

const result = await generateDocumentSummary(chunkModel, finalModel, [
  { text: 'Revenue was $10 million.', pageStart: 1, pageEnd: 1 },
  { text: 'The contract renews annually.', pageStart: 2, pageEnd: 2 },
]);
assert.equal(chunkCalls.length, 2);
assert.equal(sentenceCount(result.finalSummary), 3);
assert.match(result.finalSummary, /annual renewal/);

await assert.rejects(
  () => generateFinalSummary({ async invoke() { return { content: 'Only one sentence.' }; } }, ['one summary']),
  (error: unknown) => error instanceof SummaryGenerationError && /3 to 5 sentences/.test(error.message),
);
await assert.rejects(
  () => generateDocumentSummary(chunkModel, finalModel, []),
  (error: unknown) => error instanceof SummaryGenerationError && /without chunks/.test(error.message),
);
await assert.rejects(
  () => generateDocumentSummary({ async invoke() { throw new Error('provider failure'); } }, finalModel, [{ text: 'content' }]),
  (error: unknown) => error instanceof SummaryGenerationError && /chunk summary/.test(error.message),
);
await assert.rejects(
  () => generateDocumentSummary(chunkModel, { async invoke() { return { content: 'Only one sentence.' }; } }, [{ text: 'content' }]),
  (error: unknown) => error instanceof SummaryGenerationError && /3 to 5 sentences/.test(error.message),
);

console.log('Summary unit checks: OK');
