import { API } from '../config';

const log = (step: string, detail = '') => console.info(`[docsense:web] ${step}${detail ? ` ${detail}` : ''}`);

export type ChatHistoryMessage = {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
};

type SseEvent = { event: string; data: Record<string, unknown> };

async function json<T>(path: string): Promise<T> {
  log('request:start', path);
  const response = await fetch(`${API}${path}`, { credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    log('request:failed', `${path} status=${response.status}`);
    throw new Error(typeof data.error === 'string' ? data.error : 'Request failed');
  }
  log('request:complete', `${path} status=${response.status}`);
  return data as T;
}

export function getSummary(documentId: string) {
  return json<{ summary: string | null; processingStatus: string | null }>(`/api/documents/${documentId}/summary`);
}

export async function getConversationMessages(documentId: string): Promise<{ conversationId?: string; messages: ChatHistoryMessage[] }> {
  const conversations = await json<{ conversations: Array<{ id: string }> }>(`/api/documents/${documentId}/conversations`);
  const conversationId = conversations.conversations[0]?.id;
  if (!conversationId) return { messages: [] };
  const result = await json<{ messages: ChatHistoryMessage[] }>(`/api/documents/${documentId}/conversations/${conversationId}/messages`);
  return { conversationId, messages: result.messages };
}

export async function streamChat(
  documentId: string,
  question: string,
  conversationId: string | undefined,
  onEvent: (event: SseEvent) => void,
): Promise<string> {
  log('chat:start', `document=${documentId} conversation=${conversationId ?? 'new'}`);
  const response = await fetch(`${API}/api/documents/${documentId}/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ question, ...(conversationId ? { conversationId } : {}) }),
  });
  if (!response.ok || !response.body) {
    log('chat:failed', `document=${documentId} status=${response.status}`);
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.error === 'string' ? data.error : 'Chat request failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let returnedConversationId = conversationId ?? '';
  const consume = (block: string) => {
    const lines = block.split('\n');
    const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message';
    const dataLine = lines.find((line) => line.startsWith('data:'))?.slice(5).trim();
    if (!dataLine) return;
    const data = JSON.parse(dataLine) as Record<string, unknown>;
    if (typeof data.conversationId === 'string') returnedConversationId = data.conversationId;
    log('chat:event', `document=${documentId} event=${event}`);
    onEvent({ event, data });
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    blocks.filter(Boolean).forEach(consume);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  log('chat:complete', `document=${documentId} conversation=${returnedConversationId}`);
  return returnedConversationId;
}
