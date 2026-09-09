import { Prisma } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { authorizeDocument } from './share.service.js';
import { commentConnections } from './comment-connection.manager.js';
import type { CreateCommentInput } from '../middleware/validation.js';

type Principal = { userId?: string; sessionId?: string };

async function authorizeCommentAccess(documentId: string, principal: Principal) {
  const access = await authorizeDocument(documentId, principal);
  if (access.kind === 'guest' && !access.session) throw forbidden('You do not have access to this document');
  return access;
}

const commentSelect = {
  id: true,
  documentId: true,
  parentId: true,
  userId: true,
  shareId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true } },
} as const;

type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

function present(row: CommentRow) {
  return {
    id: row.id,
    documentId: row.documentId,
    parentId: row.parentId,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: row.user
      ? { type: 'user' as const, id: row.user.id, name: row.user.name }
      : { type: 'guest' as const, id: row.shareId },
  };
}

export async function listComments(documentId: string, principal: Principal) {
  await authorizeCommentAccess(documentId, principal);
  const rows = await prisma.comment.findMany({
    where: { documentId },
    orderBy: { createdAt: 'asc' },
    select: commentSelect,
  });
  const comments = rows.map((row) => ({ ...present(row), replies: [] as ReturnType<typeof present>[] }));
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const roots: typeof comments = [];
  for (const comment of comments) {
    if (!comment.parentId) roots.push(comment);
    else byId.get(comment.parentId)?.replies.push(comment);
  }
  return roots;
}

export async function createComment(documentId: string, input: CreateCommentInput, principal: Principal) {
  const access = await authorizeCommentAccess(documentId, principal);
  let parentId: string | null = input.parentId;
  if (parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: parentId }, select: { documentId: true } });
    if (!parent) throw badRequest('Parent comment not found');
    if (parent.documentId !== documentId) throw badRequest('Parent comment belongs to another document');
  }

  const row = await prisma.comment.create({
    data: {
      documentId,
      parentId,
      content: input.content as Prisma.InputJsonValue,
      ...(access.kind === 'owner'
        ? { userId: principal.userId }
        : { shareId: access.session.shareId }),
    },
    select: commentSelect,
  });
  const comment = present(row);
  commentConnections.broadcast(documentId, {
    type: 'comment.created',
    documentId,
    comment: {
      id: comment.id,
      parentId: comment.parentId,
      content: comment.content,
      author: comment.author,
      createdAt: comment.createdAt.toISOString(),
    },
  });
  return comment;
}
