import assert from 'node:assert/strict';

import { assertEmbedding, embedDocuments, embedQuery, EMBEDDING_DIMENSION, type EmbeddingModel } from '../src/ai/models/embeddings.js';

const vector = (first: number, second = 0) => Array.from({ length: EMBEDDING_DIMENSION }, (_, index) => index === 0 ? first : index === 1 ? second : 0);
const model: EmbeddingModel = {
  async embedDocuments(texts) {
    return texts.map((_, index) => vector(index + 1));
  },
  async embedQuery() {
    return vector(1);
  },
};

const documents = await embedDocuments(['one', 'two'], model);
assert.equal(documents.length, 2);
assert.equal(documents[0]?.length, EMBEDDING_DIMENSION);
assert.deepEqual(await embedQuery('question', model), vector(1));

assert.throws(() => assertEmbedding([1, 2]), /3072/);
assert.throws(() => assertEmbedding(vector(Number.NaN)), /finite/);
await assert.rejects(
  () => embedDocuments(['one'], { ...model, embedDocuments: async () => [] }),
  /unexpected result count/,
);
await assert.rejects(
  () => embedQuery('question', { ...model, embedQuery: async () => [1] }),
  /3072/,
);

console.log('Embedding unit checks: OK');
