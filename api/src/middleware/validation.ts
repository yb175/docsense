import type { MiddlewareHandler } from 'hono';

// Validation middleware belongs here; feature-specific schemas will be added later.
export const validationMiddleware: MiddlewareHandler = async (_c, next) => {
  await next();
};
