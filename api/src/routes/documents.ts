import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { getDocument, getDocumentContent, getDocumentSummary, listOwnedDocuments, uploadDocument } from '../controllers/document.controller.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import type { AppEnv } from '../types/index.js';

export const documentRoutes = new Hono<AppEnv>();

documentRoutes.get('/', requireAuth, listOwnedDocuments);
documentRoutes.get('/:documentId/summary', optionalAuth, getDocumentSummary);
documentRoutes.get('/:documentId', optionalAuth, getDocument);
documentRoutes.get('/:documentId/content', optionalAuth, getDocumentContent);

documentRoutes.post(
  '/',
  requireAuth,
  bodyLimit({
    maxSize: env.MAX_PDF_SIZE_BYTES + 64 * 1024,
    onError: (c) => c.json({ error: 'PDF exceeds the maximum allowed size' }, 413),
  }),
  uploadDocument,
);
