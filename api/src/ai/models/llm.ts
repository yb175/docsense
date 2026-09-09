import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

import { env } from '../../lib/env.js';

export function createChunkSummaryModel() {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for chunk summaries');
  return new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: env.AI_CHUNK_SUMMARY_MODEL,
    temperature: 0,
  });
}

export function createChatModel() {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for chat');
  return new ChatOpenAI({
    apiKey: env.OPENAI_API_KEY,
    model: env.AI_CHAT_MODEL,
    temperature: 0,
  });
}

export function createIntentModel() {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for intent classification');
  return new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: env.AI_FALLBACK_CHAT_MODEL,
    temperature: 0,
  });
}

export function createFallbackChatModel() {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for chat fallback');
  return new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: env.AI_FALLBACK_CHAT_MODEL,
    temperature: 0,
  });
}

export function createFinalSummaryModel() {
  if (env.OPENAI_API_KEY) {
    return new ChatOpenAI({
      apiKey: env.OPENAI_API_KEY,
      model: env.AI_SUMMARY_MODEL,
      temperature: 0,
    });
  }
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for final summaries');
  return new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: env.AI_FALLBACK_CHAT_MODEL,
    temperature: 0,
  });
}

export function createVisionModel() {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for visual PDF analysis');
  return new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: env.AI_VISION_MODEL,
    temperature: 0,
  });
}
