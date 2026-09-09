import { Hono } from 'hono';

import { chatHandler, listChatMessagesHandler, listConversationsHandler } from '../controllers/chat.controller.js';
import { optionalAuth } from '../middleware/auth.js';
import { chatSchema, validateJson } from '../middleware/validation.js';
import type { AppEnv } from '../types/index.js';

export const chatRoutes = new Hono<AppEnv>();

chatRoutes.get('/documents/:documentId/conversations', optionalAuth, listConversationsHandler);
chatRoutes.get('/documents/:documentId/conversations/:conversationId/messages', optionalAuth, listChatMessagesHandler);
chatRoutes.post('/documents/:documentId/chat', optionalAuth, validateJson(chatSchema), chatHandler);
