import { z } from 'zod';

const Email = z.string().trim().toLowerCase().pipe(z.email());

function loadEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Treat empty strings from .env files as "unset".
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    result[key] = value === '' ? undefined : value;
  }
  return result;
}

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  REDIS_URL: z.string().min(1),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().min(1).default('Docsense <no-reply@docsense.local>'),
});

const parsed = Schema.safeParse(loadEnv(process.env));

if (!parsed.success) {
  // Do not print values: they may be secrets.
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
