import type { Handler } from 'hono';

import { getAuthenticatedUser, login, logout, signup, verifyEmail } from '../services/auth.service.js';
import type { AppEnv } from '../types/index.js';
import type { LoginInput, SignupInput, VerifyEmailInput } from '../middleware/validation.js';

export const signupHandler: Handler<AppEnv> = async (c) => {
  const user = await signup(c.get('body') as SignupInput);
  return c.json(
    { user, message: 'Signup successful. Check your inbox for the verification code.' },
    201,
  );
};

export const verifyEmailHandler: Handler<AppEnv> = async (c) => {
  const user = await verifyEmail(c.get('body') as VerifyEmailInput);
  return c.json({ user, message: 'Email verified.' });
};

export const loginHandler: Handler<AppEnv> = async (c) => {
  return c.json(await login(c.get('body') as LoginInput));
};

export const logoutHandler: Handler<AppEnv> = async (c) => {
  await logout(c.get('auth'));
  return c.body(null, 204);
};

export const meHandler: Handler<AppEnv> = async (c) => {
  return c.json({ user: await getAuthenticatedUser(c.get('auth').userId) });
};
