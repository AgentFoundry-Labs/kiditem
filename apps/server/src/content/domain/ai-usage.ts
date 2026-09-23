import type { AiUsageAgentKey } from '@kiditem/shared/ai';

/**
 * Which agent an API call belongs to, by the first segment after `/api`. The
 * agent is whoever's screen or endpoint asked for the model work.
 */
const AGENT_BY_API_SEGMENT: Readonly<Record<string, AiUsageAgentKey>> = {
  sourcing: 'sourcing',
  ai: 'product',
  'thumbnail-editor': 'product',
  'thumbnail-auto': 'product',
  'text-ai': 'product',
  'image-ai': 'product',
  'render-image': 'product',
  products: 'product',
  channels: 'mall',
  orders: 'mall',
  inventory: 'inventory',
  ads: 'marketing',
  reviews: 'cs',
  finance: 'finance',
};

export function agentForApiPath(path: string): AiUsageAgentKey | null {
  const segment = /^\/api\/([^/?#]+)/.exec(path)?.[1];
  return segment ? (AGENT_BY_API_SEGMENT[segment] ?? null) : null;
}

/** Gemini's `usageMetadata`, as far as billing needs it. */
export type GeminiUsageMetadata = Readonly<{
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
  thoughtsTokenCount?: number | null;
}>;

/** Input and billed output tokens; thinking tokens bill as output. */
export function geminiTokens(
  usage: GeminiUsageMetadata | null | undefined,
): { inputTokens: number; outputTokens: number } | null {
  if (!usage) return null;
  const count = (value: number | null | undefined) =>
    Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : 0;
  const inputTokens = count(usage.promptTokenCount);
  const outputTokens = count(usage.candidatesTokenCount) + count(usage.thoughtsTokenCount);
  return inputTokens + outputTokens > 0 ? { inputTokens, outputTokens } : null;
}

/**
 * USD per million tokens, Gemini API standard tier. Only prices we can vouch
 * for are listed; any other model records its tokens with an unknown cost
 * rather than a guessed one.
 */
const USD_PER_MILLION: Readonly<Record<string, { input: number; output: number }>> = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash-image': { input: 0.3, output: 30 },
  'gemini-2.5-flash-image-preview': { input: 0.3, output: 30 },
};

export function isPricedModel(model: string): boolean {
  return normalizeModel(model) in USD_PER_MILLION;
}

/** Estimated cost in millionths of a US dollar, or null when unpriced. */
export function estimateCostMicroUsd(
  model: string,
  tokens: { inputTokens: number; outputTokens: number },
): bigint | null {
  const price = USD_PER_MILLION[normalizeModel(model)];
  if (!price) return null;
  // USD per million tokens is micro-USD per token.
  return BigInt(Math.round(tokens.inputTokens * price.input + tokens.outputTokens * price.output));
}

function normalizeModel(model: string): string {
  return model.replace(/^models\//, '').trim();
}
