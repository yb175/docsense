import type { MiddlewareHandler } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../types/index.js';

const Email = z.string().trim().toLowerCase().pipe(z.email());

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: Email,
  password: z.string().min(8).max(128),
});

export const verifyEmailSchema = z.object({
  email: Email,
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

export const loginSchema = z.object({
  email: Email,
  password: z.string().min(1).max(128),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

const commentMarkSchema = z.enum(['bold', 'italic']);
const commentSpanSchema = z.strictObject({
  text: z.string().min(1).max(10_000),
  marks: z.array(commentMarkSchema).max(2).default([]),
});
const commentParagraphSchema = z.strictObject({
  type: z.literal('paragraph'),
  content: z.array(commentSpanSchema).min(1).max(100),
});
const commentListSchema = z.strictObject({
  type: z.literal('bulletList'),
  items: z.array(z.array(commentSpanSchema).min(1).max(100)).min(1).max(100),
});
export const commentContentSchema = z.strictObject({
  blocks: z.array(z.union([commentParagraphSchema, commentListSchema])).min(1).max(100),
});
export const createCommentSchema = z.strictObject({
  parentId: z.string().uuid().nullable(),
  content: commentContentSchema,
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

/** Parses and validates the JSON body; result is available as `c.get('body')`. */
export function validateJson(schema: z.ZodType): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body' }, 400);
    }
    c.set('body', parsed.data);
    await next();
  };
}
