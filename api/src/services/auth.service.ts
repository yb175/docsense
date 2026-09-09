import { prisma } from '../db/prisma.js';
import { otpKey, redis } from '../db/redis.js';
import { env } from '../lib/env.js';
import { badRequest, conflict, forbidden, unauthorized } from '../lib/errors.js';
import { AUTH_TOKEN_TTL_SECONDS, signAuthToken } from '../lib/jwt.js';
import { EMAIL_OTP_TTL_SECONDS, generateOtp, hashOtp, verifyOtp } from '../lib/otp.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { emailSender } from './email.service.js';

const PUBLIC_USER = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  createdAt: true,
} as const;

export async function signup(input: { name: string; email: string; password: string }) {
  const email = normalize(input.email);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw conflict('An account with this email already exists');

  const user = await prisma.user.create({
    data: { name: input.name.trim(), email, passwordHash: await hashPassword(input.password) },
    select: PUBLIC_USER,
  });

  try {
    await issueVerificationOtp(user.id, user.email, user.name);
  } catch (error) {
    // Email failed: remove the half-created account so signup can be retried.
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    throw error;
  }

  return user;
}

export async function verifyEmail(input: { email: string; otp: string }) {
  const email = normalize(input.email);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const invalid = () => badRequest('The verification code is invalid or has expired');
  if (!user) throw invalid();

  // GETDEL consumes the OTP atomically: even a wrong guess burns it (1 guess per code).
  const storedHash = await redis.getdel(otpKey(user.id));
  if (!storedHash || !verifyOtp(input.otp, storedHash)) throw invalid();

  return prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
    select: PUBLIC_USER,
  });
}

export async function login(input: { email: string; password: string }) {
  const email = normalize(input.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw unauthorized('Invalid email or password');
  }
  if (!user.emailVerified) {
    throw forbidden('Email address is not verified');
  }

  return {
    token: await signAuthToken(user.id),
    tokenType: 'Bearer' as const,
    expiresIn: AUTH_TOKEN_TTL_SECONDS,
    user: publicUser(user),
  };
}

/** Blacklist the token's `jti` in Redis for the remainder of its lifetime. */
export async function logout(auth: { jti: string; exp: number }) {
  const remainingSeconds = auth.exp - Math.floor(Date.now() / 1000);
  if (remainingSeconds > 0) {
    await redis.set(`jwt:revoked:${auth.jti}`, '1', 'EX', Math.ceil(remainingSeconds));
  }
}

export async function getAuthenticatedUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: PUBLIC_USER });
  if (!user) throw unauthorized();
  return user;
}

async function issueVerificationOtp(userId: string, email: string, name: string) {
  const otp = generateOtp();
  await redis.set(otpKey(userId), hashOtp(otp), 'EX', EMAIL_OTP_TTL_SECONDS);
  await emailSender.send({
    to: email,
    subject: 'Verify your Docsense email',
    text:
      `Hi ${name},\n\n` +
      `Your Docsense verification code is ${otp}.\n` +
      `It expires in 3 minutes and can be used once.\n\n` +
      `If you did not create this account, ignore this email.`,
  });
}

const normalize = (email: string) => email.trim().toLowerCase();

const publicUser = (user: { id: string; name: string; email: string; emailVerified: boolean; createdAt: Date }) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt,
});
