import { Redis } from 'ioredis';

import { env } from '../lib/env.js';

/** Shared Redis client: OTP storage + JWT revocation. */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 2,
});

export const revokedJtiKey = (jti: string) => `jwt:revoked:${jti}`;
export const otpKey = (userId: string) => `auth:email-otp:${userId}`;
export const shareOtpKey = (shareId: string) => `share:otp:${shareId}`;
export const shareOtpCooldownKey = (shareId: string) => `share:otp:cooldown:${shareId}`;
export const shareOtpWindowKey = (shareId: string) => `share:otp:window:${shareId}`;
export const guestSessionKey = (sessionId: string) => `guest:session:${sessionId}`;
