import { getCookie } from 'hono/cookie';
import type { Context } from 'hono';

import { createComment, listComments } from '../services/comment.service.js';
import type { AppEnv } from '../types/index.js';
import type { CreateCommentInput } from '../middleware/validation.js';

function principal(c: Context<AppEnv>) {
  return { userId: c.get('auth')?.userId, sessionId: getCookie(c, 'docsense_guest_session') };
}

export async function listCommentsHandler(c: Context<AppEnv>) {
  return c.json({ comments: await listComments(c.req.param('documentId')!, principal(c)) });
}

export async function createCommentHandler(c: Context<AppEnv>) {
  const comment = await createComment(
    c.req.param('documentId')!,
    c.get('body') as CreateCommentInput,
    principal(c),
  );
  return c.json({ comment }, 201);
}
