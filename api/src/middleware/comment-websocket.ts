import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';

import { badRequest } from '../lib/errors.js';
import { authorizeDocument } from '../services/share.service.js';
import type { AppEnv } from '../types/index.js';

export const authorizeCommentSocket = createMiddleware<AppEnv>(async (c, next) => {
  const documentId = c.req.param('documentId');
  if (!documentId) throw badRequest('Invalid document id');
  await authorizeDocument(documentId, {
    userId: c.get('auth')?.userId,
    sessionId: getCookie(c, 'docsense_guest_session'),
  });
  c.set('wsDocumentId', documentId);
  await next();
});
