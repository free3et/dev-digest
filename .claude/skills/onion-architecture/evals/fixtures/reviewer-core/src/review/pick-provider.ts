import type { LLMProvider } from '../llm/types.js';
import { OpenRouterProvider } from '../llm/openrouter.js';

export function pickProvider(modelId: string): LLMProvider {
  const apiKey = process.env.OPENROUTER_API_KEY ?? '';
  return new OpenRouterProvider({ apiKey, model: modelId });
}
