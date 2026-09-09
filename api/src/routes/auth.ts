import { Hono } from 'hono';

import {
  loginHandler,
  logoutHandler,
  meHandler,
  signupHandler,
  verifyEmailHandler,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loginSchema, signupSchema, validateJson, verifyEmailSchema } from '../middleware/validation.js';
import type { AppEnv } from '../types/index.js';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/signup', validateJson(signupSchema), signupHandler);
authRoutes.post('/verify-email', validateJson(verifyEmailSchema), verifyEmailHandler);
authRoutes.post('/login', validateJson(loginSchema), loginHandler);
authRoutes.post('/logout', requireAuth, logoutHandler);

// Minimal protected route; future modules mount behind the same middleware.
authRoutes.get('/me', requireAuth, meHandler);
