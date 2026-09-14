import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';

const BASE = '/api/sourcing/live-commerce/browser';

export interface SourcingLiveCommerceSourceStatus {
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

export interface SourcingLiveCommerceCollectionReply {
  success: boolean;
  attemptId: string;
  terminalState: 'RUNNING' | 'COMPLETE' | 'FAILED';
  retryRequired?: boolean;
  attentionRequired?: boolean;
  errorCode?: string;
  error?: string;
}

/** The page calls the extension; the extension alone begins the owner attempt. */
export async function collectSourcingLiveCommerceFromExtension(input: {
  idempotencyKey: string;
  url: string;
}): Promise<SourcingLiveCommerceCollectionReply> {
  const extensionId = await detectExtensionId();
  if (!extensionId) {
    throw new Error('KidItem OS 익스텐션을 연결한 뒤 다시 시도해주세요.');
  }
  const response = await sendToExtension<unknown>(
    extensionId,
    {
      action: 'collectSourcingLiveCommerce',
      idempotencyKey: input.idempotencyKey,
      url: input.url,
    },
    null,
  );
  return parseCollectionReply(response);
}

export function fetchSourcingLiveCommerceSourceStatus(
  url: string,
): Promise<SourcingLiveCommerceSourceStatus> {
  return apiClient.get<SourcingLiveCommerceSourceStatus>(
    `${BASE}/current?url=${encodeURIComponent(url)}`,
  );
}

/** The owner's operator stop for a running browser live-commerce attempt; it needs no attempt token. */
export function cancelSourcingLiveCommerceAttempt(attemptId: string): Promise<unknown> {
  return apiClient.post(`${BASE}/attempts/${encodeURIComponent(attemptId)}/cancel`);
}

function parseCollectionReply(value: unknown): SourcingLiveCommerceCollectionReply {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('KidItem OS 익스텐션이 라이브 수집 결과를 올바르게 반환하지 않았습니다.');
  }
  const reply = value as Record<string, unknown>;
  if (
    typeof reply.success !== 'boolean'
    || typeof reply.attemptId !== 'string'
    || !reply.attemptId
    || !['RUNNING', 'COMPLETE', 'FAILED'].includes(reply.terminalState as string)
  ) {
    throw new Error('KidItem OS 익스텐션이 라이브 수집 결과를 올바르게 반환하지 않았습니다.');
  }
  return {
    success: reply.success,
    attemptId: reply.attemptId,
    terminalState: reply.terminalState as SourcingLiveCommerceCollectionReply['terminalState'],
    ...(typeof reply.retryRequired === 'boolean' ? { retryRequired: reply.retryRequired } : {}),
    ...(typeof reply.attentionRequired === 'boolean' ? { attentionRequired: reply.attentionRequired } : {}),
    ...(typeof reply.errorCode === 'string' ? { errorCode: reply.errorCode } : {}),
    ...(typeof reply.error === 'string' ? { error: reply.error } : {}),
  };
}
