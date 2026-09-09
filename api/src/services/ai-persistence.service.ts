import { randomUUID } from 'node:crypto';
import { MessageRole } from '@prisma/client';

import { assertEmbedding } from '../ai/models/embeddings.js';
import type { DocumentChunkInput } from '../ai/splitters/document-splitter.js';

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

export async function appendCompletedTurn(input: {
  documentId: string;
  conversationId: string;
  question: string;
  answer: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const conversation = await transaction.conversation.findFirst({ where: { id: input.conversationId, documentId: input.documentId }, select: { id: true } });
    if (!conversation) throw badRequest('Conversation does not belong to this document');
    await transaction.message.createMany({ data: [
      { conversationId: input.conversationId, role: MessageRole.USER, content: input.question },
      { conversationId: input.conversationId, role: MessageRole.ASSISTANT, content: input.answer },
    ] });
    await transaction.conversation.update({ where: { id: conversation.id }, data: {} });
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

export async function persistChunkEmbeddings(
  chunks: DocumentChunkInput[],
  embeddings: number[][],
): Promise<void> {
  if (chunks.length !== embeddings.length) throw new Error('Chunk and embedding counts must match');
  embeddings.forEach(assertEmbedding);

  await prisma.$transaction(async (transaction) => {
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index]!;
      const embedding = embeddings[index]!;
      const vector = `[${embedding.join(',')}]`;
      await transaction.$executeRaw`
        INSERT INTO "document_chunks" (
          "id", "documentId", "chunkIndex", "text", "pageStart", "pageEnd", "embedding"
        ) VALUES (
          ${randomUUID()}::uuid,
          ${chunk.documentId}::uuid,
          ${chunk.chunkIndex},
          ${chunk.text},
          ${chunk.pageStart},
          ${chunk.pageEnd},
          ${vector}::vector
        )
        ON CONFLICT ("documentId", "chunkIndex") DO UPDATE SET
          "text" = EXCLUDED."text",
          "pageStart" = EXCLUDED."pageStart",
          "pageEnd" = EXCLUDED."pageEnd",
          "embedding" = EXCLUDED."embedding"
      `;
    }
  });
}
