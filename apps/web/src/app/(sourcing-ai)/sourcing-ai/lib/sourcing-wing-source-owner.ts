import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import type { SourcingWingCatalogBatchInput } from '@kiditem/shared/sourcing';

export interface WingSourceAttempt {
  attemptId: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  errorCode?: string | null;
  errorMessage?: string | null;
  plan?: { keywords: string[]; maxPages: number; purpose: string };
}

export async function collectWingCatalog(input: SourcingWingCatalogBatchInput & { idempotencyKey: string }) {
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error('KidItem OS 익스텐션을 연결한 뒤 다시 시도해주세요.');
  const reply = await sendToExtension<WingSourceAttempt & { success: boolean; error?: string }>(extensionId,
    { action: 'collectSourcingWingCatalog', ...input }, null);
  if (!reply?.attemptId || reply.state !== 'COMPLETE' || reply.success !== true) {
    throw Object.assign(new Error(reply?.errorMessage || reply?.error || 'Wing 카탈로그 수집이 완료되지 않았습니다.'), { terminalState: reply?.state });
  }
  // These are explicit owner commands requested by this CTA's purpose, after source terminality.
  if (input.purpose === 'market_analysis' || input.purpose === 'recommendation_validation') {
    const recommendations = await apiClient.post<{ data?: { runId: string } | null; error?: { message: string } | null }>(
      '/api/sourcing/workspace/recommendations/refresh', { sourceAttemptId: reply.attemptId });
    if (!recommendations.data?.runId) throw new Error(recommendations.error?.message || '추천 새로고침에 실패했습니다.');
    if (input.purpose === 'recommendation_validation') {
      const validation = await apiClient.post<{ status: string; error?: { message: string } | null }>(
        '/api/sourcing/workspace/validation/refresh', { recommendationRunId: recommendations.data.runId });
      if (validation.status !== 'ready') throw new Error(validation.error?.message || '검증 새로고침에 실패했습니다.');
    }
  }
  return reply;
}

export function readWingSourceAttempt(attemptId?: string | null): Promise<WingSourceAttempt | null> {
  return apiClient.get(`/api/sourcing/workspace/wing-catalog/${attemptId ? `attempts/${encodeURIComponent(attemptId)}` : 'current'}`);
}

export async function cancelWingSourceAttempt(attemptId: string) {
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error('KidItem OS 익스텐션을 연결해주세요.');
  const reply = await sendToExtension<{ success?: boolean; error?: string }>(extensionId,
    { action: 'cancelCollectionSession', attemptId }, null);
  if (reply?.success !== true) throw new Error(reply?.error || '수집 취소에 실패했습니다.');
}
