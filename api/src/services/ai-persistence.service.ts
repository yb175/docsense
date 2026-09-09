import { MessageRole } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { badRequest } from '../lib/errors.js';

type ConversationPrincipal =
  | { userId: string; shareId?: never }
  | { shareId: string; userId?: never };

function assertPrincipal(principal: ConversationPrincipal): void {
  if (('userId' in principal) === ('shareId' in principal)) {
    throw badRequest('A conversation requires exactly one access principal');
  }
}

export async function createConversation(input: {
  documentId: string;
  principal: ConversationPrincipal;
}) {
  assertPrincipal(input.principal);
  return prisma.conversation.create({
    data: {
      documentId: input.documentId,
      ...('userId' in input.principal ? { userId: input.principal.userId } : { shareId: input.principal.shareId }),
    },
    select: { id: true, documentId: true, userId: true, shareId: true, createdAt: true, updatedAt: true },
  });
}

export async function listConversationMessages(documentId: string, conversationId: string) {
  return prisma.message.findMany({
    where: { conversationId, conversation: { documentId } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, conversationId: true, role: true, content: true, createdAt: true },
  });
}

export async function appendMessage(input: {
  documentId: string;
  conversationId: string;
  role: MessageRole;
  content: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const conversation = await transaction.conversation.findFirst({
      where: { id: input.conversationId, documentId: input.documentId },
      select: { id: true },
    });
    if (!conversation) throw badRequest('Conversation does not belong to this document');

    const message = await transaction.message.create({
      data: {
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
      },
      select: { id: true, conversationId: true, role: true, content: true, createdAt: true },
    });
    await transaction.conversation.update({ where: { id: conversation.id }, data: {} });
    return message;
  });
}

export async function createDocumentChunk(input: {
  documentId: string;
  chunkIndex: number;
  text: string;
  pageStart?: number;
  pageEnd?: number;
}) {
  return prisma.documentChunk.create({
    data: input,
    select: { id: true, documentId: true, chunkIndex: true, text: true, pageStart: true, pageEnd: true, createdAt: true },
  });
}

export async function listDocumentChunks(documentId: string) {
  return prisma.documentChunk.findMany({
    where: { documentId },
    orderBy: { chunkIndex: 'asc' },
    select: { id: true, documentId: true, chunkIndex: true, text: true, pageStart: true, pageEnd: true, createdAt: true },
  });
}
