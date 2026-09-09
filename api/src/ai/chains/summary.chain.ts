import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { BaseMessage } from '@langchain/core/messages';

import { chunkSummarySystemPrompt, finalSummarySystemPrompt } from '../prompts/summary.prompt.js';

export type SummaryModel = {
  invoke(messages: BaseMessage[]): Promise<{ content: unknown }>;
};

export type SummaryChunk = {
  text: string;
  pageStart?: number | null;
  pageEnd?: number | null;
};

export class SummaryGenerationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SummaryGenerationError';
  }
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((part) => typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string' ? [part.text] : [])
    .join('\n')
    .trim();
}

function sentenceCount(text: string): number {
  return text.match(/[^.!?]+[.!?]+(?=\s|$)/gu)?.length ?? 0;
}

async function invokePrompt(model: SummaryModel, system: string, input: string): Promise<string> {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{input}'],
  ]);
  const response = await model.invoke(await prompt.formatMessages({ input }));
  const text = contentText(response.content);
  if (!text) throw new SummaryGenerationError('Summary model returned empty content');
  return text;
}

export async function generateChunkSummary(model: SummaryModel, chunk: SummaryChunk): Promise<string> {
  try {
    return await invokePrompt(model, chunkSummarySystemPrompt, chunk.text);
  } catch (error) {
    if (error instanceof SummaryGenerationError) throw error;
    throw new SummaryGenerationError('Unable to generate chunk summary', { cause: error });
  }
}

export async function generateFinalSummary(model: SummaryModel, chunkSummaries: string[]): Promise<string> {
  if (chunkSummaries.length === 0) throw new SummaryGenerationError('Cannot summarize a document without chunk summaries');
  try {
    const input = chunkSummaries.map((summary, index) => `Chunk ${index + 1}:\n${summary}`).join('\n\n');
    const summary = await invokePrompt(model, finalSummarySystemPrompt, input);
    const sentences = sentenceCount(summary);
    if (sentences < 3 || sentences > 5) {
      throw new SummaryGenerationError(`Final summary must contain 3 to 5 sentences; received ${sentences}`);
    }
    return summary;
  } catch (error) {
    if (error instanceof SummaryGenerationError) throw error;
    throw new SummaryGenerationError('Unable to generate final summary', { cause: error });
  }
}

export async function generateDocumentSummary(
  chunkModel: SummaryModel,
  finalModel: SummaryModel,
  chunks: SummaryChunk[],
): Promise<{ chunkSummaries: string[]; finalSummary: string }> {
  if (chunks.length === 0) throw new SummaryGenerationError('Cannot summarize a document without chunks');
  const chunkSummaries: string[] = [];
  for (const chunk of chunks) {
    chunkSummaries.push(await generateChunkSummary(chunkModel, chunk));
  }
  return { chunkSummaries, finalSummary: await generateFinalSummary(finalModel, chunkSummaries) };
}

export { sentenceCount };
