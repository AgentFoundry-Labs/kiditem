import { z } from 'zod';

/**
 * The agents AI spend is attributed to, in the sidebar's order. A call no agent
 * owns is recorded with no agent rather than guessed into one.
 */
export const AI_USAGE_AGENT_KEYS = [
  'sourcing',
  'product',
  'mall',
  'inventory',
  'marketing',
  'cs',
  'finance',
] as const;
export const AiUsageAgentKeySchema = z.enum(AI_USAGE_AGENT_KEYS);
export type AiUsageAgentKey = z.infer<typeof AiUsageAgentKeySchema>;

export const AI_USAGE_AGENT_LABELS: Record<AiUsageAgentKey, string> = {
  sourcing: '소싱',
  product: '상품',
  mall: '쇼핑몰',
  inventory: '재고관리',
  marketing: '마케팅',
  cs: 'CS',
  finance: '재무분석',
};

/** Rough KRW view of a USD estimate; the estimate itself stays in USD. */
export const AI_USAGE_KRW_PER_USD = 1_390;

const CountSchema = z.number().int().nonnegative();

export const AiUsageTotalsSchema = z.object({
  calls: CountSchema,
  inputTokens: CountSchema,
  outputTokens: CountSchema,
  /** Sum over priced calls only, in millionths of a US dollar. */
  costMicroUsd: CountSchema,
  /** Calls whose model has no registered price — tokens counted, cost unknown. */
  unpricedCalls: CountSchema,
}).strict();
export type AiUsageTotals = z.infer<typeof AiUsageTotalsSchema>;

export const AiUsageSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  /** When metering began; nothing before it was recorded. */
  recordingSince: z.string().nullable(),
  totals: AiUsageTotalsSchema,
  agents: z.array(AiUsageTotalsSchema.extend({ agentKey: AiUsageAgentKeySchema.nullable() }).strict()),
  models: z.array(AiUsageTotalsSchema.extend({ model: z.string(), priced: z.boolean() }).strict()),
}).strict();
export type AiUsageSummary = z.infer<typeof AiUsageSummarySchema>;
