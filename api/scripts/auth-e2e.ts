/**
 * End-to-end auth verification against a running API + PostgreSQL + Redis +
 * Mailpit. Run: `npm run dev` in one shell, then `npm run e2e:auth`.
 *
 * OTP expiry is asserted via the Redis TTL (proves the 3-minute window is
 * configured) plus key deletion (proves the expired/absent code is rejected),
 * so the script never has to sleep for 3 minutes.
 */
import { Redis } from 'ioredis';
import { SignJWT, decodeJwt } from 'jose';

import { prisma } from '../src/db/prisma.js';
import { env } from '../src/lib/env.js';
import { AUTH_TOKEN_TTL_SECONDS } from '../src/lib/jwt.js';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });

type ApiUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt?: string;
};

type ApiBody = {
  user?: ApiUser;
  token?: string;
  expiresIn?: number;
  error?: string;
  message?: string;
};

let passed = 0;
function check(name: string, condition: boolean, detail = '') {
  if (!condition) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  passed += 1;
  console.log(`  ok  ${name}`);
}

async function api(path: string, init?: RequestInit): Promise<{
  status: number;
  body: ApiBody;
  headers: Headers;
}> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const text = await res.text();
  let body: ApiBody = {};
  if (res.status !== 204 && text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON from ${path}: ${JSON.stringify(text)}`);
    }
  }
  return { status: res.status, body, headers: res.headers };
}

/** Poll Mailpit for the newest email to `address` and extract its 6-digit OTP. */
async function otpFromMailpit(address: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as {
      messages: { ID: string; To: { Address: string }[] }[];
    };
    const match = list.messages
      .filter((m) => m.To?.some((r) => r.Address.toLowerCase() === address))
      .at(-1);
    if (match) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${match.ID}`)).json()) as {
        Text: string;
      };
      const otp = /\b(\d{6})\b/.exec(message.Text)?.[1];
      if (otp) return otp;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No OTP email found for ${address} in Mailpit`);
}

const unique = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e4)}@docsense.test`;
const secretKey = new TextEncoder().encode(env.JWT_SECRET);

async function main() {
  console.log(`Auth e2e against ${BASE}`);

  // Drop leftovers from previous runs so the test data stays deterministic.
  await prisma.user.deleteMany({ where: { email: { endsWith: '@docsense.test' } } });
  const otpKeys = await redis.keys('auth:email-otp:*');
  if (otpKeys.length) await redis.del(...otpKeys);

  // --- signup -------------------------------------------------------------
  const email = unique();
  const password = 'correct horse battery staple 1';
  const signup = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'E2E User', email: `  ${email.toUpperCase()}  `, password }),
  });
  check('signup returns 201', signup.status === 201, String(signup.status));
  check('signup normalizes email to lowercase', signup.body?.user?.email === email);
  check('signup response hides passwordHash', !JSON.stringify(signup.body).includes('passwordHash'));

  const row = await prisma.user.findUnique({ where: { email } });
  check('user persisted', Boolean(row));
  check('password stored as scrypt hash, not plaintext', row?.passwordHash.startsWith('scrypt$') === true && row?.passwordHash.includes(password) === false);
  check('new user emailVerified = false', row?.emailVerified === false);

  const dup = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'Dup', email, password }),
  });
  check('duplicate email rejected with 409', dup.status === 409, String(dup.status));

  const otpTtl = await redis.ttl(`auth:email-otp:${row?.id}`);
  check('OTP stored with 3-minute TTL', otpTtl > 0 && otpTtl <= 180, `ttl=${otpTtl}`);

  // --- login blocked before verification ---------------------------------
  const earlyLogin = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  check('login rejected before email verification (403)', earlyLogin.status === 403, String(earlyLogin.status));

  // --- bad input ----------------------------------------------------------
  const badSignup = await api('/auth/signup', { method: 'POST', body: JSON.stringify({ name: '', email: 'nope', password: '123' }) });
  check('invalid signup body rejected with 400', badSignup.status === 400, String(badSignup.status));
  const badOtpShape = await api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email, otp: '12ab45' }) });
  check('non-numeric OTP rejected with 400', badOtpShape.status === 400, String(badOtpShape.status));

  // --- email verification -------------------------------------------------
  const otp = await otpFromMailpit(email);
  check('verification email delivered through SMTP abstraction', /^\d{6}$/.test(otp));

  // A wrong guess consumes the code (one guess per OTP), so this account can
  // no longer be verified — it stays unverified on purpose.
  const wrongOtp = await api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email, otp: otp === '000000' ? '111111' : '000000' }) });
  check('wrong OTP rejected', wrongOtp.status === 400, String(wrongOtp.status));

  // --- happy verification path --------------------------------------------
  const email2 = unique();
  const signup2 = await api('/auth/signup', { method: 'POST', body: JSON.stringify({ name: 'E2E Two', email: email2, password }) });
  check('second signup returns 201', signup2.status === 201, String(signup2.status));
  const otp2 = await otpFromMailpit(email2);
  const verify = await api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email: email2, otp: otp2 }) });
  check('correct OTP verifies email', verify.status === 200, String(verify.status));
  check('emailVerified flipped to true', verify.body?.user?.emailVerified === true);
  check('verification creates an auth token', typeof verify.body?.token === 'string' && verify.body.token.length > 0);
  check('verification sets the auth cookie', /docsense_auth=/.test(verify.headers.get('set-cookie') ?? ''));

  const replay = await api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email: email2, otp: otp2 }) });
  check('verified OTP cannot be reused', replay.status === 400, String(replay.status));

  // --- expired OTP (TTL window proven above; key removal = post-expiry) ----
  const email3 = unique();
  await api('/auth/signup', { method: 'POST', body: JSON.stringify({ name: 'E2E Three', email: email3, password }) });
  const user3 = await prisma.user.findUnique({ where: { email: email3 } });
  const liveOtp = await otpFromMailpit(email3);
  await redis.del(`auth:email-otp:${user3?.id}`);
  const expiredVerify = await api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email: email3, otp: liveOtp }) });
  check('expired OTP rejected', expiredVerify.status === 400, String(expiredVerify.status));

  // --- login --------------------------------------------------------------
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: email2, password }) });
  check('login succeeds after verification', login.status === 200, String(login.status));
  const token = login.body.token;
  if (!token) throw new Error('Login response did not contain a token');
  check('login reports 3-day expiry', login.body.expiresIn === AUTH_TOKEN_TTL_SECONDS && AUTH_TOKEN_TTL_SECONDS === 259_200);

  const verifiedUserId = verify.body.user?.id;
  if (!verifiedUserId) throw new Error('Email verification response did not contain a user');
  const claims = decodeJwt(token);
  check('JWT sub is the user id', claims.sub === verifiedUserId);
  check('JWT carries a jti', typeof claims.jti === 'string' && claims.jti.length > 0);
  check('JWT exp is exactly 3 days after iat', (claims.exp ?? 0) - (claims.iat ?? 0) === 259_200);
  check('JWT contains no password or OTP material', !/passw|otp|hash/i.test(JSON.stringify(claims)));

  const wrongPassword = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: email2, password: 'wrong password here 1' }) });
  check('wrong password rejected with 401', wrongPassword.status === 401, String(wrongPassword.status));
  const unknownEmail = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: unique(), password }) });
  check('unknown email rejected with 401 (same message)', unknownEmail.status === 401 && unknownEmail.body?.error === wrongPassword.body?.error);

  // --- protected route ----------------------------------------------------
  const me = await api('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  check('protected route accepts valid JWT', me.status === 200 && me.body?.user?.email === email2, String(me.status));
  check('protected response hides passwordHash', !JSON.stringify(me.body).includes('passwordHash'));

  const noToken = await api('/auth/me');
  check('protected route rejects missing token', noToken.status === 401, String(noToken.status));

  const tampered = `${token.slice(0, -6)}${token.slice(-6).split('').reverse().join('')}`;
  const badSig = await api('/auth/me', { headers: { Authorization: `Bearer ${tampered}` } });
  check('tampered JWT rejected', badSig.status === 401, String(badSig.status));

  const wrongSecret = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub ?? '')
    .setJti('forged-jti')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode('a'.repeat(40)));
  const forged = await api('/auth/me', { headers: { Authorization: `Bearer ${wrongSecret}` } });
  check('JWT signed with a different secret rejected', forged.status === 401, String(forged.status));

  const expiredToken = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub ?? '')
    .setJti('expired-jti')
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(secretKey);
  const expired = await api('/auth/me', { headers: { Authorization: `Bearer ${expiredToken}` } });
  check('expired JWT rejected', expired.status === 401, String(expired.status));

  // --- logout / revocation -------------------------------------------------
  const logout = await api('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  check('logout returns 204', logout.status === 204, String(logout.status));

  const revokedTtl = await redis.ttl(`jwt:revoked:${claims.jti}`);
  check('jti blacklisted in Redis with remaining-lifetime TTL', revokedTtl > 259_200 - 120 && revokedTtl <= 259_200, `ttl=${revokedTtl}`);

  const afterLogout = await api('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  check('same JWT rejected after logout', afterLogout.status === 401, String(afterLogout.status));

  const reLogin = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: email2, password }) });
  check('a fresh token works after logout', reLogin.status === 200, String(reLogin.status));
  const freshToken = reLogin.body.token;
  if (!freshToken) throw new Error('Second login response did not contain a token');
  const freshMe = await api('/auth/me', { headers: { Authorization: `Bearer ${freshToken}` } });
  check('fresh token passes the protected route', freshMe.status === 200, String(freshMe.status));

  await api('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${freshToken}` } });

  // --- cleanup -------------------------------------------------------------
  await prisma.user.deleteMany({ where: { email: { in: [email, email2, email3] } } });
  console.log(`\n${passed} auth e2e checks passed`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
