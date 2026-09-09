import { MessageRole } from '@prisma/client';
import type { BaseMessage } from '@langchain/core/messages';

import { classifyChatIntent, type ConversationMessage, type IntentModel } from '../ai/context/context-builder.js';
import { createChatModel, createFallbackChatModel, createIntentModel } from '../ai/models/llm.js';
import { createEmbeddingModel, type EmbeddingModel } from '../ai/models/embeddings.js';
import { buildDocumentChatContext } from '../ai/ai.service.js';
import {
  appendCompletedTurn,
  createConversation,
  listConversationMessages,
} from './ai-persistence.service.js';
import { prisma } from '../db/prisma.js';
import { forbidden } from '../lib/errors.js';
import type { GuestSession } from './share.service.js';

export type StreamingChatChunk = { content: unknown };

export type StreamingChatModel = {
  stream(messages: BaseMessage[]): Promise<AsyncIterable<StreamingChatChunk>>;
};

export type ChatAccess =
  | { kind: 'owner'; userId: string }
  | { kind: 'guest'; session: GuestSession };

function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (typeof content === 'object' && content !== null && 'text' in content && typeof content.text === 'string') return content.text;
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((part) => typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string' ? [part.text] : [])
    .join('');
}

export function extractChatToken(chunk: StreamingChatChunk): string {
  return messageText(chunk.content);
}

export function countChatSentences(text: string): number {
  return [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)].filter((segment) => segment.segment.trim()).length;
}

export function isConciseChatResponse(text: string): boolean {
  const sentences = countChatSentences(text);
  return sentences >= 3 && sentences <= 5;
}

async function authorizeConversation(input: {
  documentId: string;
  conversationId: string;
  access: ChatAccess;
}) {
  const where = input.access.kind === 'owner'
    ? { id: input.conversationId, documentId: input.documentId, userId: input.access.userId }
    : { id: input.conversationId, documentId: input.documentId, shareId: input.access.session.shareId };
  const conversation = await prisma.conversation.findFirst({ where, select: { id: true } });
  if (!conversation) throw forbidden('You do not have access to this conversation');
  return conversation;
}

function principalFor(access: ChatAccess) {
  return access.kind === 'owner' ? { userId: access.userId } : { shareId: access.session.shareId };
}

async function selectConversation(input: {
  documentId: string;
  conversationId?: string;
  access: ChatAccess;
}) {
  if (input.conversationId) return authorizeConversation({ documentId: input.documentId, conversationId: input.conversationId, access: input.access });
  return createConversation({ documentId: input.documentId, principal: principalFor(input.access) });
}

export function streamWithFallback(
  primary: StreamingChatModel,
  fallback: StreamingChatModel,
  messages: BaseMessage[],
): AsyncGenerator<string> {
  async function* run() {
    let emitted = false;
    for (const model of [primary, fallback]) {
      try {
        const stream = await model.stream(messages);
        for await (const chunk of stream) {
          const token = extractChatToken(chunk);
          if (!token) continue;
          emitted = true;
          yield token;
        }
        return;
      } catch (error) {
        if (emitted || model === fallback) throw error;
      }
    }
  }
  return run();
}

export async function prepareChat(input: {
  documentId: string;
  question: string;
  conversationId?: string;
  access: ChatAccess;
  embeddingModel?: EmbeddingModel;
  chatModel?: StreamingChatModel;
  fallbackModel?: StreamingChatModel;
  intentModel?: IntentModel;
}) {
  const conversation = await selectConversation(input);
  const previousMessages = await listConversationMessages(input.documentId, conversation.id);
  const conversationHistory: ConversationMessage[] = previousMessages.map((message) => ({
    role: message.role === MessageRole.USER ? 'user' : 'assistant',
    content: message.content,
  }));
  let intent: 'normal' | 'document_summary' | 'explain_again' = 'normal';
  try {
    intent = await classifyChatIntent(input.intentModel ?? createIntentModel(), input.question);
  } catch {
    // Intent is an optimization; a failed classifier must not block grounded chat.
  }
  const previousAssistantResponse = [...conversationHistory].reverse().find((message) => message.role === 'assistant')?.content;
  const previousUserQuestion = [...conversationHistory].reverse().find((message) => message.role === 'user')?.content;
  const document = await prisma.document.findUnique({ where: { id: input.documentId }, select: { aiSummary: true } });
  const context = await buildDocumentChatContext({
    documentId: input.documentId,
    question: input.question,
    retrievalQuestion: intent === 'explain_again' ? previousUserQuestion ?? input.question : input.question,
    conversation: conversationHistory,
    documentSummary: document?.aiSummary,
    previousAssistantResponse,
    intent,
    topK: intent === 'document_summary' ? 8 : undefined,
    model: input.embeddingModel ?? createEmbeddingModel(),
  });

  let primary: StreamingChatModel;
  try {
    primary = input.chatModel ?? createChatModel();
  } catch (error) {
    if (input.chatModel) throw error;
    primary = createFallbackChatModel();
  }
  const fallback = input.fallbackModel ?? {
    stream: (messages: BaseMessage[]) => createFallbackChatModel().stream(messages),
  };

  return {
    conversationId: conversation.id,
    messages: context.messages,
    stream: streamWithFallback(primary, fallback, context.messages),
  };
}

export async function listAuthorizedConversations(input: { documentId: string; access: ChatAccess }) {
  const where = input.access.kind === 'owner'
    ? { documentId: input.documentId, userId: input.access.userId }
    : { documentId: input.documentId, shareId: input.access.session.shareId };
  return prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 1,
    select: { id: true },
  });
}

export async function listAuthorizedChatMessages(input: {
  documentId: string;
  conversationId: string;
  access: ChatAccess;
}) {
  await authorizeConversation(input);
  return listConversationMessages(input.documentId, input.conversationId);
}

export async function persistCompletedTurn(documentId: string, conversationId: string, question: string, answer: string) {
  if (!answer.trim()) throw new Error('Cannot persist an empty assistant response');
  return appendCompletedTurn({ documentId, conversationId, question, answer });
}
