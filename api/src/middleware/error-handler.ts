import type { ErrorHandler } from 'hono';

export const errorHandler: ErrorHandler = (error, c) => {
  console.error(error);
  return c.json({ error: 'Internal Server Error' }, 500);
};
