import { upgradeWebSocket } from '@hono/node-server';
import { Hono } from 'hono';

import { optionalAuth } from '../middleware/auth.js';
import { authorizeCommentSocket } from '../middleware/comment-websocket.js';
import { commentConnections } from '../services/comment-connection.manager.js';
import type { AppEnv } from '../types/index.js';

export const commentWebSocketRoutes = new Hono<AppEnv>();

commentWebSocketRoutes.get(
  '/ws/documents/:documentId/comments',
  optionalAuth,
  authorizeCommentSocket,
  upgradeWebSocket((c) => {
    const documentId = c.get('wsDocumentId');
    return {
      onOpen: (_event, socket) => commentConnections.add(documentId, socket),
      onClose: (_event, socket) => commentConnections.remove(documentId, socket),
    };
  }),
);
