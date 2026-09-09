import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';

import type { RetrievedChunk } from '../retrieval/retriever.js';

export const MAX_CONVERSATION_TURNS = 5;

export const chatIntentSchema = z.object({
  intent: z.enum(['normal', 'document_summary', 'explain_again']),
});
export type ChatIntent = z.infer<typeof chatIntentSchema>['intent'];

export type IntentModel = {
  invoke(messages: BaseMessage[]): Promise<{ content: unknown }>;
};

function responseText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.flatMap((part) => typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string' ? [part.text] : []).join('').trim();
  return '';
}

export async function classifyChatIntent(model: IntentModel, question: string): Promise<ChatIntent> {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'Classify the user request for a PDF assistant. Return JSON only: {{"intent":"normal|document_summary|explain_again"}}. Use document_summary for requests to summarize, give an overview, or list key points. Use explain_again when the user asks to clarify, rephrase, simplify, or explain a previous answer. Use normal for all other document questions.'],
    ['human', '{question}'],
  ]);
  const response = await model.invoke(await prompt.formatMessages({ question }));
  const parsed = chatIntentSchema.safeParse(JSON.parse(responseText(response.content)));
  if (!parsed.success) throw new Error('Intent model returned an invalid intent');
  return parsed.data.intent;
}

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
  intent: ChatIntent;
};

export const chatSystemPrompt = `You answer questions about a PDF using retrieved document context.

Retrieved PDF context is the source of truth for factual claims about the document. Conversation history is only conversational context and is not evidence. If the retrieved context does not support an answer, say: "I couldn't find that information in the document." Do not invent facts, numbers, names, dates, conclusions, or page references. Only mention page numbers that appear in the retrieved context.

Every answer must be concise: write exactly 3 to 5 complete sentences. Do not use bullet lists, headings, repeated words, or line-by-line code explanations. Combine related details into one sentence and answer only what the user asked.`;

function intentInstruction(intent: ChatIntent): string {
  if (intent === 'document_summary') return 'The user wants a document summary. Prefer the supplied document summary when present, then use retrieved chunks for supporting detail. Do not claim full-document coverage if no document summary is supplied.';
  if (intent === 'explain_again') return 'The user wants a clearer explanation of the previous answer. Preserve its supported facts, correct any uncertainty using PDF context, and explain it in simpler language. Do not introduce new unsupported claims.';
  return 'Answer the current document question directly using the retrieved PDF context.';
}

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
  documentSummary?: string | null;
  previousAssistantResponse?: string;
  intent?: ChatIntent;
  maxTurns?: number;
}): Promise<RagContext> {
  const maxTurns = input.maxTurns ?? MAX_CONVERSATION_TURNS;
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > MAX_CONVERSATION_TURNS) {
    throw new Error(`maxTurns must be between 1 and ${MAX_CONVERSATION_TURNS}`);
  }
  const conversation = (input.conversation ?? []).slice(-maxTurns * 2);
  const intent = input.intent ?? 'normal';
  const pdfContext = formatPdfContext(input.chunks);
  const conversationContext = formatConversationContext(conversation);
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', `${chatSystemPrompt}\n\n${intentInstruction(intent)}`],
    ['human', 'Document summary:\n{documentSummary}\n\nPrevious assistant response:\n{previousAssistantResponse}\n\nPDF context:\n{pdfContext}\n\nConversation:\n{conversationContext}\n\nQuestion:\n{question}'],
  ]);
  const messages = await prompt.formatMessages({
    documentSummary: input.documentSummary || 'No stored document summary is available.',
    previousAssistantResponse: input.previousAssistantResponse || 'No previous assistant response is available.',
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
    intent,
  };
}
