import { serve } from '@hono/node-server';
import { Hono } from 'hono';

import { errorHandler } from './middleware/error-handler.js';
import { env } from './lib/env.js';

const app = new Hono();

app.onError(errorHandler);

app.get('/health', (c) => c.json({ status: 'ok' }));

const port = env.PORT;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

export default app;
