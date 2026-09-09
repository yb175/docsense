import { randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { WebSocketServer } from 'ws';
import { cors } from 'hono/cors';

import { errorHandler } from './middleware/error-handler.js';
import { env } from './lib/env.js';
import { authRoutes } from './routes/auth.js';
import { commentRoutes } from './routes/comments.js';
import { commentWebSocketRoutes } from './routes/comment-websocket.js';
import { chatRoutes } from './routes/chat.js';
import { documentRoutes } from './routes/documents.js';
import { shareRoutes } from './routes/shares.js';

const app = new Hono();
const webSocketServer = new WebSocketServer({ noServer: true });

app.onError(errorHandler);

app.use('*', async (c, next) => {
  const startedAt = Date.now();
  const requestId = randomUUID().slice(0, 8);
  c.header('X-Request-Id', requestId);
  console.info(`[api:${requestId}] ${c.req.method} ${c.req.path} start`);
  try {
    await next();
  } finally {
    console.info(`[api:${requestId}] ${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - startedAt}ms`);
  }
});

app.get('/health', (c) => c.json({ status: 'ok' }));
app.use('*', cors({
  origin: [
    env.APP_URL,
    'http://localhost:5173', 'http://localhost:4173', 'http://localhost:5174',
    'http://127.0.0.1:5173', 'http://127.0.0.1:4173', 'http://127.0.0.1:5174',
  ],
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
}));
app.route('/auth', authRoutes);
app.route('/api/documents', documentRoutes);
app.route('/api', chatRoutes);
app.route('/api', commentRoutes);
app.route('/api', shareRoutes);
app.route('/', commentWebSocketRoutes);

const port = env.PORT;

serve({ fetch: app.fetch, port, websocket: { server: webSocketServer } }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

export default app;
