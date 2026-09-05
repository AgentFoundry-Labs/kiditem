import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';

const BASE = '/api/sourcing/1688-trends';

export interface Sourcing1688TrendSourceStatus {
  status: 'READY' | 'STALE' | 'MISSING';
  refreshing: boolean;
  latestAttempt: {
    attemptId: string;
    state: 'RUNNING' | 'COMPLETE' | 'FAILED';
    expiresAt: string;
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
  latestComplete: {
    attemptId: string;
    completedAt: string | null;
  } | null;
  actualCutoffAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface Sourcing1688TrendCollectionReply {
  success: boolean;
  attemptId: string;
  terminalState: 'RUNNING' | 'COMPLETE' | 'FAILED';
  retryRequired?: boolean;
  attentionRequired?: boolean;
  errorCode?: string;
  error?: string;
}

/** The page asks only the extension; the extension owns the single server begin. */
export async function collectSourcing1688TrendsFromExtension(input: {
  idempotencyKey: string;
}): Promise<Sourcing1688TrendCollectionReply> {
  const extensionId = await detectExtensionId();
  if (!extensionId) {
    throw new Error('KidItem OS 익스텐션을 연결한 뒤 다시 시도해주세요.');
  }
  const response = await sendToExtension<unknown>(
    extensionId,
    { action: 'collectSourcing1688Trends', idempotencyKey: input.idempotencyKey },
    null,
  );
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('KidItem OS 익스텐션이 1688 수집 결과를 올바르게 반환하지 않았습니다.');
  }
  const reply = response as Record<string, unknown>;
  if (
    typeof reply.success !== 'boolean'
    || typeof reply.attemptId !== 'string'
    || !['RUNNING', 'COMPLETE', 'FAILED'].includes(reply.terminalState as string)
  ) {
    throw new Error('KidItem OS 익스텐션이 1688 수집 결과를 올바르게 반환하지 않았습니다.');
  }
  return reply as Sourcing1688TrendCollectionReply;
}

export function fetchSourcing1688TrendSourceStatus(): Promise<Sourcing1688TrendSourceStatus> {
  return apiClient.get<Sourcing1688TrendSourceStatus>(`${BASE}/current`);
}
