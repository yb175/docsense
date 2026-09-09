import type { Handler } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';

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

const secureCookie = process.env.NODE_ENV === 'production';

export const loginHandler: Handler<AppEnv> = async (c) => {
  const result = await login(c.get('body') as LoginInput);
  setCookie(c, 'docsense_auth', result.token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: secureCookie ? 'None' : 'Lax',
    path: '/',
    maxAge: result.expiresIn,
  });
  return c.json(result);
};

export const logoutHandler: Handler<AppEnv> = async (c) => {
  await logout(c.get('auth'));
  deleteCookie(c, 'docsense_auth', { path: '/' });
  return c.body(null, 204);
};

export const meHandler: Handler<AppEnv> = async (c) => {
  return c.json({ user: await getAuthenticatedUser(c.get('auth').userId) });
};
