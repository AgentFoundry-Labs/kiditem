import {
  Sourcing1688ImageMatchInputSchema,
  Sourcing1688KeywordBatchInputSchema,
  Sourcing1688SearchSnapshotSchema,
  type Sourcing1688SearchSnapshot,
} from '@kiditem/shared/sourcing';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface Wholesale1688ResultQuery {
  keywords?: readonly string[];
  targetIds?: readonly string[];
}

export type Wholesale1688Command =
  | { kind: 'keyword-search'; input: { keywords: string[] } }
  | { kind: 'image-matches'; input: { targetIds: string[] } };

const Wholesale1688AttemptSchema = z.object({
  attemptId: z.string().uuid(),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  plan: z.object({ keyword: z.string(), targetId: z.string().optional() }),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
export type Wholesale1688Attempt = z.infer<typeof Wholesale1688AttemptSchema>;

export async function collectWholesale1688(command: Wholesale1688Command, idempotencyKey: string) {
  const input = command.kind === 'keyword-search'
    ? Sourcing1688KeywordBatchInputSchema.parse(command.input)
    : Sourcing1688ImageMatchInputSchema.parse(command.input);
  const response = await apiClient.post(`/api/sourcing/wholesale/1688/${command.kind}`, input, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return z.object({ attempts: z.array(Wholesale1688AttemptSchema).max(24) }).parse(response).attempts;
}

export async function readWholesale1688Attempt(kind: Wholesale1688Command['kind'], attemptId: string) {
  const response = await apiClient.getParsed(`/api/sourcing/wholesale/1688/${kind}/${encodeURIComponent(attemptId)}`,
    z.object({ attempt: Wholesale1688AttemptSchema }));
  return response.attempt;
}

export function fetchWholesale1688Results(
  input: Wholesale1688ResultQuery,
): Promise<Sourcing1688SearchSnapshot> {
  const normalized = normalizeWholesale1688ResultQuery(input);
  const params = new URLSearchParams();
  for (const keyword of normalized.keywords) params.append('keyword', keyword);
  for (const targetId of normalized.targetIds) params.append('targetId', targetId);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return apiClient.getParsed(
    `/api/sourcing/wholesale/1688-results${suffix}`,
    Sourcing1688SearchSnapshotSchema,
  );
}

export function wholesale1688ResultsQueryKey(input: Wholesale1688ResultQuery) {
  const normalized = normalizeWholesale1688ResultQuery(input);
  return queryKeys.sourcing.wholesale1688Results(
    normalized.keywords,
    normalized.targetIds,
  );
}

export function normalizeWholesale1688ResultQuery(
  input: Wholesale1688ResultQuery,
): { keywords: string[]; targetIds: string[] } {
  return {
    keywords: input.keywords && input.keywords.length > 0
      ? Sourcing1688KeywordBatchInputSchema.parse({
          keywords: [...input.keywords],
        }).keywords
      : [],
    targetIds: input.targetIds && input.targetIds.length > 0
      ? Sourcing1688ImageMatchInputSchema.parse({
          targetIds: [...input.targetIds],
        }).targetIds
      : [],
  };
}
