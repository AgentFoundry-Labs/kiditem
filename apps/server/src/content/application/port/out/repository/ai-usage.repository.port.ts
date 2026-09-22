import type { AiUsageAgentKey, AiUsageSummary } from '@kiditem/shared/ai';
import type { AiUsageEntry } from '../../../usage/ai-usage-meter';

export const AI_USAGE_REPOSITORY_PORT = Symbol('AI_USAGE_REPOSITORY_PORT');

export interface AiUsageRepositoryPort {
  insert(entry: AiUsageEntry & { costMicroUsd: bigint | null }): Promise<void>;
  /** `[from, to)` totals by agent and by model; `agentKey` narrows to one agent. */
  summarize(input: {
    organizationId: string;
    from: Date;
    to: Date;
    agentKey?: AiUsageAgentKey;
  }): Promise<Omit<AiUsageSummary, 'from' | 'to'>>;
}
