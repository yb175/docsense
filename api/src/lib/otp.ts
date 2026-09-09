import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/** Verification codes are valid for exactly three minutes. */
export const EMAIL_OTP_TTL_SECONDS = 3 * 60;

/** 6-digit OTP from the CSPRNG. */
export const generateOtp = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

/** OTPs are stored only as SHA-256 hashes (short-lived, high-entropy secrets). */
export const hashOtp = (otp: string): string => createHash('sha256').update(otp).digest('hex');

export function verifyOtp(otp: string, storedHash: string): boolean {
  const actual = Buffer.from(hashOtp(otp), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
