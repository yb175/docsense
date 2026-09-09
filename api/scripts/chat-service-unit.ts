import assert from 'node:assert/strict';

import { countChatSentences, extractChatToken, isConciseChatResponse, streamWithFallback, type StreamingChatModel } from '../src/services/chat.service.js';

async function* tokens(values: unknown[]) {
  for (const content of values) yield { content };
}

const primary: StreamingChatModel = {
  async stream() {
    return tokens(['Hello ', { type: 'text', text: 'world' }]);
  },
};
const fallback: StreamingChatModel = {
  async stream() {
    return tokens(['fallback']);
  },
};
const successful = streamWithFallback(primary, fallback, []);
const successTokens: string[] = [];
for await (const token of successful) successTokens.push(token);
assert.deepEqual(successTokens, ['Hello ', 'world']);
assert.equal(extractChatToken({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }), 'ab');
assert.equal(countChatSentences('One. Two. Three.'), 3);
assert.equal(isConciseChatResponse('One. Two. Three.'), true);
assert.equal(isConciseChatResponse('One. Two.'), false);
assert.equal(isConciseChatResponse('One. Two. Three. Four. Five. Six.'), false);

const primaryFailure: StreamingChatModel = {
  async stream() {
    throw new Error('primary unavailable');
  },
};
const fallbackTokens: string[] = [];
for await (const token of streamWithFallback(primaryFailure, fallback, []) ) fallbackTokens.push(token);
assert.deepEqual(fallbackTokens, ['fallback']);

const partialFailure: StreamingChatModel = {
  async stream() {
    return (async function* () {
      yield { content: 'partial' };
      throw new Error('connection lost');
    })();
  },
};
await assert.rejects(async () => {
  for await (const _token of streamWithFallback(partialFailure, fallback, [])) {
    // The primary response must not be silently merged with fallback output.
  }
}, /connection lost/);

console.log('Chat service unit checks: OK');
