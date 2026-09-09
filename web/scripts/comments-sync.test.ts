import assert from 'node:assert/strict';
import { insertComment } from '../src/services/comment-state.ts';

const content = { blocks: [{ type: 'paragraph' as const, content: [{ text: 'hello', marks: [] as never[] }] }] };
const root = { id: 'root', documentId: 'a', parentId: null, content, createdAt: '', author: { type: 'user' as const, id: 'bob', name: 'Bob' }, replies: [] };
const reply = { ...root, id: 'reply', parentId: 'root', author: { type: 'user' as const, id: 'alice', name: 'Alice' } };

const withRoot = insertComment([], root);
assert.equal(withRoot.length, 1);
const withReply = insertComment(withRoot, reply);
assert.equal(withReply[0]?.replies.length, 1);
assert.equal(insertComment(withReply, reply), withReply, 'duplicate events must be ignored');
assert.deepEqual(insertComment(withReply, { ...root, id: 'other', parentId: 'missing' }), withReply, 'orphan replies must be ignored');
console.log('frontend comment state checks: OK');
