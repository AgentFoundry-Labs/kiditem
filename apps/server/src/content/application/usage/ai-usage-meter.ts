import { AsyncLocalStorage } from 'node:async_hooks';
import type { AiUsageAgentKey } from '@kiditem/shared/ai';
import { geminiTokens, type GeminiUsageMetadata } from '../../domain/ai-usage';

/** Who a model call is for: set per HTTP request and per direct-job run. */
export type AiUsageContext = Readonly<{
  organizationId: string;
  agentKey: AiUsageAgentKey | null;
}>;

export type AiUsageEntry = Readonly<{
  organizationId: string;
  agentKey: AiUsageAgentKey | null;
  provider: 'gemini';
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
}>;

type AiUsageWriter = (entry: AiUsageEntry) => Promise<void>;

const context = new AsyncLocalStorage<AiUsageContext>();
let writer: AiUsageWriter | null = null;

/**
 * Metering for provider calls. Adapters report what the provider billed;
 * the context says for whom. It never throws into a model call: with no
 * context (an unattributed background call) or no writer bound (tests), the
 * call simply goes unmetered.
 */
export const aiUsageMeter = {
  run<T>(usageContext: AiUsageContext, fn: () => T): T {
    return context.run(usageContext, fn);
  },
  /** For the rest of the current async chain — one HTTP request's. */
  enter(usageContext: AiUsageContext): void {
    context.enterWith(usageContext);
  },
  bind(next: AiUsageWriter | null): void {
    writer = next;
  },
  recordGemini(input: {
    model: string;
    operation: string;
    usage: GeminiUsageMetadata | null | undefined;
  }): void {
    const current = context.getStore();
    const tokens = geminiTokens(input.usage);
    if (!current || !tokens || !writer) return;
    void writer({
      organizationId: current.organizationId,
      agentKey: current.agentKey,
      provider: 'gemini',
      model: input.model,
      operation: input.operation,
      ...tokens,
    }).catch(() => undefined);
  },
};
