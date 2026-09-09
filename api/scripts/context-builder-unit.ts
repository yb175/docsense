import assert from 'node:assert/strict';
import type { BaseMessage } from '@langchain/core/messages';

import { buildRagContext, classifyChatIntent } from '../src/ai/context/context-builder.js';
import type { RetrievedChunk } from '../src/ai/retrieval/retriever.js';

const intentModel = { async invoke(messages: BaseMessage[]) {
  const question = String(messages.at(-1)?.content ?? '');
  return { content: question.includes('overview') ? '{"intent":"document_summary"}' : '{"intent":"explain_again"}' };
} };
assert.equal(await classifyChatIntent(intentModel, 'Give me an overview.'), 'document_summary');
assert.equal(await classifyChatIntent(intentModel, 'Explain that again.'), 'explain_again');
await assert.rejects(() => classifyChatIntent({ async invoke() { return { content: 'not-json' }; } }, 'question'), SyntaxError);

const chunks: RetrievedChunk[] = [
  { id: '1', documentId: 'doc', chunkIndex: 0, text: 'Revenue was $10 million.', pageStart: 2, pageEnd: 2, similarity: 0.91 },
  { id: '2', documentId: 'doc', chunkIndex: 1, text: 'The renewal term is annual.', pageStart: null, pageEnd: null, similarity: 0.82 },
];
const messages = Array.from({ length: 12 }, (_, index) => ({
  role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
  content: `turn-${index + 1}`,
}));

const context = await buildRagContext({ question: 'What is the revenue?', chunks, conversation: messages });
assert.equal(context.hasDocumentContext, true);
assert.match(context.pdfContext, /Page 2/);
assert.match(context.pdfContext, /Revenue was \$10 million/);
assert.match(context.pdfContext, /The renewal term is annual/);
assert.doesNotMatch(context.pdfContext, /Page null/);
assert.equal(context.conversation.length, 10);
assert.equal(context.conversation[0]?.content, 'turn-3');
assert.equal(context.conversation.at(-1)?.content, 'turn-12');
assert.match(String(context.messages[0]?.content), /source of truth/);
assert.match(String(context.messages.at(-1)?.content), /What is the revenue/);

const empty = await buildRagContext({ question: 'What is not in this document?', chunks: [] });
assert.equal(empty.hasDocumentContext, false);
assert.equal(empty.pdfContext, 'No relevant PDF context was retrieved.');
assert.match(String(empty.messages[0]?.content), /couldn't find that information/);

await assert.rejects(() => buildRagContext({ question: 'x', chunks: [], maxTurns: 0 }), /maxTurns/);
await assert.rejects(() => buildRagContext({ question: 'x', chunks: [], maxTurns: 6 }), /maxTurns/);

console.log('Context builder unit checks: OK');
