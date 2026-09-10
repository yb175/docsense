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

const MAX_CHUNK_SUMMARY_CHARS = 1200;
const MAX_REDUCTION_ITEMS = 20;
const SUMMARY_CONCURRENCY = 4;

async function invokePrompt(model: SummaryModel, system: string, input: string): Promise<string> {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{input}'],
  ]);
  const response = await model.invoke(await prompt.formatMessages({ input }));
  const text = contentText(response.content);
  if (!text) throw new SummaryGenerationError('Summary model returned empty content');
  return text.slice(0, MAX_CHUNK_SUMMARY_CHARS);
}

export async function generateChunkSummary(model: SummaryModel, chunk: SummaryChunk): Promise<string> {
  try {
    return await invokePrompt(model, chunkSummarySystemPrompt, `<document_data>${chunk.text}</document_data>`);
  } catch (error) {
    if (error instanceof SummaryGenerationError) throw error;
    throw new SummaryGenerationError('Unable to generate chunk summary', { cause: error });
  }
}

async function reduceSummaries(model: SummaryModel, summaries: string[]): Promise<string[]> {
  const reduced: string[] = [];
  for (let index = 0; index < summaries.length; index += MAX_REDUCTION_ITEMS) {
    const input = summaries.slice(index, index + MAX_REDUCTION_ITEMS).map((summary, offset) => `Chunk ${index + offset + 1}:\n<document_data>${summary}</document_data>`).join('\n\n');
    reduced.push(await invokePrompt(model, finalSummarySystemPrompt, input));
  }
  return reduced;
}

export async function generateFinalSummary(model: SummaryModel, chunkSummaries: string[]): Promise<string> {
  if (chunkSummaries.length === 0) throw new SummaryGenerationError('Cannot summarize a document without chunk summaries');
  try {
    let summaries = chunkSummaries;
    while (summaries.length > MAX_REDUCTION_ITEMS) summaries = await reduceSummaries(model, summaries);
    const input = summaries.map((summary, index) => `Chunk ${index + 1}:\n<document_data>${summary}</document_data>`).join('\n\n');
    const summary = await invokePrompt(model, finalSummarySystemPrompt, input);
    const sentences = sentenceCount(summary);
    if (sentences < 3 || sentences > 5) {
      console.warn(`[ai:summary] sentence-count-outside-target count=${sentences} target=3-5`);
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
  for (let index = 0; index < chunks.length; index += SUMMARY_CONCURRENCY) {
    const batch = await Promise.all(chunks.slice(index, index + SUMMARY_CONCURRENCY).map((chunk) => generateChunkSummary(chunkModel, chunk)));
    chunkSummaries.push(...batch);
  }
  return { chunkSummaries, finalSummary: await generateFinalSummary(finalModel, chunkSummaries) };
}

export { sentenceCount };
