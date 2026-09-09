import { Hono } from 'hono';

import { createCommentHandler, listCommentsHandler } from '../controllers/comment.controller.js';
import { optionalAuth } from '../middleware/auth.js';
import { createCommentSchema, validateJson } from '../middleware/validation.js';
import type { AppEnv } from '../types/index.js';

export const commentRoutes = new Hono<AppEnv>();

commentRoutes.use('/documents/:documentId/comments', optionalAuth);
commentRoutes.get('/documents/:documentId/comments', listCommentsHandler);
commentRoutes.post('/documents/:documentId/comments', validateJson(createCommentSchema), createCommentHandler);
