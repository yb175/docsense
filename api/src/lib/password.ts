import { randomBytes, scrypt as scryptCallback, type ScryptOptions, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as unknown as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

// OWASP scrypt parameters: N=2^17, r=8, p=1 (~128 MiB per hash).
const PARAMS = { N: 2 ** 17, r: 8, p: 1, keylen: 32 };

/**
 * scrypt hash — stdlib memory-hard KDF. The hash is self-describing so
 * parameters can be raised later without breaking existing logins.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, PARAMS.keylen, {
    ...PARAMS,
    maxmem: 128 * PARAMS.N * PARAMS.r * 2,
  });
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, keyB64] = stored.split('$');
    if (scheme !== 'scrypt' || !n || !r || !p || !saltB64 || !keyB64) return false;

    const expected = Buffer.from(keyB64, 'base64');
    const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 128 * Number(n) * Number(r) * 2,
    });

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
