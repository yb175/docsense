import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

import { env } from '../../lib/env.js';

export function createVisionModel() {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for visual PDF analysis');
  return new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: env.AI_VISION_MODEL,
    temperature: 0,
  });
}
