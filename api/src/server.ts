import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { errorHandler } from './middleware/error-handler.js';
import { env } from './lib/env.js';
import { authRoutes } from './routes/auth.js';
import { documentRoutes } from './routes/documents.js';

const app = new Hono();

app.onError(errorHandler);

app.get('/health', (c) => c.json({ status: 'ok' }));
app.use('/auth/*', cors({
  origin: [
    'http://localhost:5173', 'http://localhost:4173', 'http://localhost:5174',
    'http://127.0.0.1:5173', 'http://127.0.0.1:4173', 'http://127.0.0.1:5174',
  ],
}));
app.route('/auth', authRoutes);
app.route('/api/documents', documentRoutes);

const port = env.PORT;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

export default app;
