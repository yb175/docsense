import type { ErrorHandler } from 'hono';

import { HttpError } from '../lib/errors.js';

export const errorHandler: ErrorHandler = (error, c) => {
  if (error instanceof HttpError) {
    return c.json({ error: error.message }, error.status);
  }

  console.error(error);
  return c.json({ error: 'Internal Server Error' }, 500);
};
