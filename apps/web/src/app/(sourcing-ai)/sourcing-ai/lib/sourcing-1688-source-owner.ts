import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';

const BASE = '/api/sourcing/1688-trends';

export interface Sourcing1688TrendSourceStatus {
  ready: boolean;
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

function parseSourcing1688TrendCollectionReply(
  value: unknown,
): Sourcing1688TrendCollectionReply {
  const record = isRecord(value) ? value : null;
  if (
    !record ||
    typeof record.success !== 'boolean' ||
    typeof record.attemptId !== 'string' ||
    (record.terminalState !== 'RUNNING' &&
      record.terminalState !== 'COMPLETE' &&
      record.terminalState !== 'FAILED')
  ) {
    throw new Error('KidItem OS 익스텐션이 1688 수집 결과를 올바르게 반환하지 않았습니다.');
  }
  const reply: Sourcing1688TrendCollectionReply = {
    success: record.success,
    attemptId: record.attemptId,
    terminalState: record.terminalState,
  };
  if (record.retryRequired !== undefined) {
    if (typeof record.retryRequired !== 'boolean') throw new Error('KidItem OS 익스텐션이 1688 수집 결과를 올바르게 반환하지 않았습니다.');
    reply.retryRequired = record.retryRequired;
  }
  if (record.attentionRequired !== undefined) {
    if (typeof record.attentionRequired !== 'boolean') throw new Error('KidItem OS 익스텐션이 1688 수집 결과를 올바르게 반환하지 않았습니다.');
    reply.attentionRequired = record.attentionRequired;
  }
  if (record.errorCode !== undefined) {
    if (typeof record.errorCode !== 'string') throw new Error('KidItem OS 익스텐션이 1688 수집 결과를 올바르게 반환하지 않았습니다.');
    reply.errorCode = record.errorCode;
  }
  if (record.error !== undefined) {
    if (typeof record.error !== 'string') throw new Error('KidItem OS 익스텐션이 1688 수집 결과를 올바르게 반환하지 않았습니다.');
    reply.error = record.error;
  }
  return reply;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  return parseSourcing1688TrendCollectionReply(response);
}

export function fetchSourcing1688TrendSourceStatus(): Promise<Sourcing1688TrendSourceStatus> {
  return apiClient.get<Sourcing1688TrendSourceStatus>(`${BASE}/current`);
}

/** The owner's operator stop for a running 1688 hot-product attempt; it needs no attempt token. */
export function cancelSourcing1688TrendAttempt(attemptId: string): Promise<unknown> {
  return apiClient.post(`${BASE}/attempts/${encodeURIComponent(attemptId)}/cancel`);
}
