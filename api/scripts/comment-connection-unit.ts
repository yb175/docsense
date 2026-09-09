import assert from 'node:assert/strict';

import type { WSContext } from 'hono/ws';
import { CommentConnectionManager } from '../src/services/comment-connection.manager.js';

const manager = new CommentConnectionManager();
const socket = (readyState = 1) => ({ readyState, close() {}, send() {} }) as unknown as WSContext;
const a = socket();
const b = socket();
manager.add('document-a', a);
manager.add('document-b', b);
assert.equal(manager.getConnections('document-a').has(a), true);
assert.equal(manager.getConnections('document-a').has(b), false);
manager.remove('document-a', a);
assert.equal(manager.getConnections('document-a').size, 0);
const closed = socket(3);
manager.add('document-b', closed);
assert.equal(manager.getConnections('document-b').has(closed), false);
console.log('comment connection manager checks: OK');
