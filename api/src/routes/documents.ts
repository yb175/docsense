import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { uploadDocument } from '../controllers/document.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import type { AppEnv } from '../types/index.js';

export const documentRoutes = new Hono<AppEnv>();

documentRoutes.post(
  '/',
  requireAuth,
  bodyLimit({
    maxSize: env.MAX_PDF_SIZE_BYTES + 64 * 1024,
    onError: (c) => c.json({ error: 'PDF exceeds the maximum allowed size' }, 413),
  }),
  uploadDocument,
);
