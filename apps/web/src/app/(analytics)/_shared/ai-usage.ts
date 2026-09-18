import { useQuery } from '@tanstack/react-query';
import {
  AI_USAGE_KRW_PER_USD,
  AiUsageSummarySchema,
  type AiUsageAgentKey,
} from '@kiditem/shared/ai';
import { businessDateKey, currentBusinessDate } from '@kiditem/shared/common';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/** This KST month through today, as the usage API's inclusive dates. */
export function monthToDate(now = new Date()): { from: string; to: string } {
  const to = businessDateKey(currentBusinessDate(now));
  return { from: `${to.slice(0, 8)}01`, to };
}

/** AI token usage and estimated cost; one agent's when `agent` is given. */
export function useAiUsage(params: { from: string; to: string; agent?: AiUsageAgentKey }) {
  const query: Record<string, string> = { from: params.from, to: params.to };
  if (params.agent) query.agent = params.agent;
  return useQuery({
    queryKey: queryKeys.aiUsage.summary(query),
    queryFn: () => apiClient.getParsed(
      `/api/ai/usage?${new URLSearchParams(query).toString()}`,
      AiUsageSummarySchema,
    ),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function formatUsd(microUsd: number): string {
  const usd = microUsd / 1_000_000;
  return `$${usd < 1 && usd > 0 ? usd.toFixed(3) : usd.toFixed(2)}`;
}

export function formatKrwApprox(microUsd: number): string {
  return `약 ${Math.round((microUsd / 1_000_000) * AI_USAGE_KRW_PER_USD).toLocaleString('ko-KR')}원`;
}

export const KRW_RATE_NOTE = `1달러 ${AI_USAGE_KRW_PER_USD.toLocaleString('ko-KR')}원으로 어림한 값`;
