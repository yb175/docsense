import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { BaseMessage } from '@langchain/core/messages';

import type { RetrievedChunk } from '../retrieval/retriever.js';

export const MAX_CONVERSATION_TURNS = 5;

export type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type RagContext = {
  chunks: RetrievedChunk[];
  conversation: ConversationMessage[];
  hasDocumentContext: boolean;
  pdfContext: string;
  conversationContext: string;
  messages: BaseMessage[];
};

export const chatSystemPrompt = `You answer questions about a PDF using retrieved document context.

Retrieved PDF context is the source of truth for factual claims about the document. Conversation history is only conversational context and is not evidence. If the retrieved context does not support an answer, say: "I couldn't find that information in the document." Do not invent facts, numbers, names, dates, conclusions, or page references. Only mention page numbers that appear in the retrieved context.`;

function pageLabel(chunk: RetrievedChunk): string {
  if (chunk.pageStart === null || chunk.pageEnd === null) return '';
  return chunk.pageStart === chunk.pageEnd ? `Page ${chunk.pageStart}` : `Pages ${chunk.pageStart}-${chunk.pageEnd}`;
}

function formatPdfContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return 'No relevant PDF context was retrieved.';
  return chunks.map((chunk, index) => {
    const page = pageLabel(chunk);
    return `[Source ${index + 1}${page ? ` · ${page}` : ''}]\n${chunk.text}`;
  }).join('\n\n');
}

function formatConversationContext(messages: ConversationMessage[]): string {
  if (messages.length === 0) return 'No previous conversation.';
  return messages.map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`).join('\n');
}

export async function buildRagContext(input: {
  question: string;
  chunks: RetrievedChunk[];
  conversation?: ConversationMessage[];
  maxTurns?: number;
}): Promise<RagContext> {
  const maxTurns = input.maxTurns ?? MAX_CONVERSATION_TURNS;
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > MAX_CONVERSATION_TURNS) {
    throw new Error(`maxTurns must be between 1 and ${MAX_CONVERSATION_TURNS}`);
  }
  const conversation = (input.conversation ?? []).slice(-maxTurns * 2);
  const pdfContext = formatPdfContext(input.chunks);
  const conversationContext = formatConversationContext(conversation);
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', chatSystemPrompt],
    ['human', 'PDF context:\n{pdfContext}\n\nConversation:\n{conversationContext}\n\nQuestion:\n{question}'],
  ]);
  const messages = await prompt.formatMessages({
    pdfContext,
    conversationContext,
    question: input.question,
  });

  return {
    chunks: input.chunks,
    conversation,
    hasDocumentContext: input.chunks.length > 0,
    pdfContext,
    conversationContext,
    messages,
  };
}
