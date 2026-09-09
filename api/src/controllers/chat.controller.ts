import { getCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import type { Context } from 'hono';

import type { ChatInput } from '../middleware/validation.js';
import type { AppEnv } from '../types/index.js';
import { authorizeDocument } from '../services/share.service.js';
import { isConciseChatResponse, listAuthorizedChatMessages, listAuthorizedConversations, persistAssistantMessage, prepareChat } from '../services/chat.service.js';

const event = (type: string, payload: unknown) => ({ event: type, data: JSON.stringify(payload) });

function chatAccess(c: Context<AppEnv>, access: Awaited<ReturnType<typeof authorizeDocument>>) {
  return access.kind === 'owner'
    ? { kind: 'owner' as const, userId: c.get('auth')!.userId }
    : { kind: 'guest' as const, session: access.session };
}

export async function listConversationsHandler(c: Context<AppEnv>) {
  const documentId = c.req.param('documentId')!;
  const access = await authorizeDocument(documentId, {
    userId: c.get('auth')?.userId,
    sessionId: getCookie(c, 'docsense_guest_session'),
  });
  return c.json({ conversations: await listAuthorizedConversations({ documentId, access: chatAccess(c, access) }) });
}

export async function listChatMessagesHandler(c: Context<AppEnv>) {
  const documentId = c.req.param('documentId')!;
  const access = await authorizeDocument(documentId, {
    userId: c.get('auth')?.userId,
    sessionId: getCookie(c, 'docsense_guest_session'),
  });
  const messages = await listAuthorizedChatMessages({
    documentId,
    conversationId: c.req.param('conversationId')!,
    access: chatAccess(c, access),
  });
  return c.json({ messages });
}

export async function chatHandler(c: Context<AppEnv>) {
  const documentId = c.req.param('documentId')!;
  console.info(`[ai:chat] document=${documentId} request=start`);
  const input = c.get('body') as ChatInput;
  const access = await authorizeDocument(documentId, {
    userId: c.get('auth')?.userId,
    sessionId: getCookie(c, 'docsense_guest_session'),
  });
  console.info(`[ai:chat] document=${documentId} preparing-context conversation=${input.conversationId ?? 'new'}`);
  const prepared = await prepareChat({
    documentId,
    question: input.question,
    conversationId: input.conversationId,
    access: chatAccess(c, access),
  });

  console.info(`[ai:chat] document=${documentId} streaming conversation=${prepared.conversationId}`);
  return streamSSE(c, async (stream) => {
    await stream.writeSSE(event('message.start', { conversationId: prepared.conversationId }));
    let answer = '';
    try {
      for await (const token of prepared.stream) {
        answer += token;
        await stream.writeSSE(event('message.token', { token }));
      }
      if (!isConciseChatResponse(answer)) {
        throw new Error('The assistant returned an answer outside the required 3–5 sentence limit. Please try again.');
      }
      await persistAssistantMessage(documentId, prepared.conversationId, answer);
      await stream.writeSSE(event('message.complete', {
        conversationId: prepared.conversationId,
        content: answer,
      }));
    } catch (error) {
      await stream.writeSSE(event('message.error', {
        message: error instanceof Error ? error.message : 'Chat generation failed',
      }));
    }
  });
}
