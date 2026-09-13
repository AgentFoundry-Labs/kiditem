import { apiClient } from './api-client';

export interface TrendSourceResult {
  source: 'naver' | 'shorts' | '1688'; ok: boolean; collected: number; error?: string;
  attemptId?: string; state?: 'RUNNING' | 'COMPLETE' | 'FAILED'; actualCutoffAt?: string | null;
}
export interface TrendSourceCollectionResult { businessDate: string; results: TrendSourceResult[] }

export function collectTrendSources(sources: readonly string[] = ['naver', 'shorts'], idempotencyKey = crypto.randomUUID()) {
  return apiClient.post<TrendSourceCollectionResult>('/api/sourcing/trend/collect', { sources },
    { headers: { 'Idempotency-Key': idempotencyKey }, timeoutMs: 15 * 60_000 });
}
