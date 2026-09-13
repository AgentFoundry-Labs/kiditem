import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';

const BASE = '/api/sourcing/tiktok-creative';

export interface SourcingTiktokCcSourceStatus {
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

export interface SourcingTiktokCcCollectionReply {
  success: boolean;
  attemptId: string;
  terminalState: 'RUNNING' | 'COMPLETE' | 'FAILED';
  retryRequired?: boolean;
  attentionRequired?: boolean;
  errorCode?: string;
  error?: string;
}

/** The page calls the extension; only the extension begins the owner attempt. */
export async function collectSourcingTiktokCcTrendsFromExtension(input: {
  idempotencyKey: string;
  maxItems?: number;
  region?: string;
}): Promise<SourcingTiktokCcCollectionReply> {
  const extensionId = await detectExtensionId();
  if (!extensionId) {
    throw new Error('KidItem OS 익스텐션을 연결한 뒤 다시 시도해주세요.');
  }
  const response = await sendToExtension<unknown>(
    extensionId,
    {
      action: 'collectSourcingTiktokCcTrends',
      idempotencyKey: input.idempotencyKey,
      ...(input.maxItems === undefined ? {} : { maxItems: input.maxItems }),
      ...(input.region === undefined ? {} : { region: input.region }),
    },
    null,
  );
  return parseCollectionReply(response);
}

export function fetchSourcingTiktokCcSourceStatus(): Promise<SourcingTiktokCcSourceStatus> {
  return apiClient.get<SourcingTiktokCcSourceStatus>(`${BASE}/current`);
}

function parseCollectionReply(value: unknown): SourcingTiktokCcCollectionReply {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('KidItem OS 익스텐션이 틱톡 수집 결과를 올바르게 반환하지 않았습니다.');
  }
  const reply = value as Record<string, unknown>;
  if (
    typeof reply.success !== 'boolean'
    || typeof reply.attemptId !== 'string'
    || !reply.attemptId
    || !['RUNNING', 'COMPLETE', 'FAILED'].includes(reply.terminalState as string)
  ) {
    throw new Error('KidItem OS 익스텐션이 틱톡 수집 결과를 올바르게 반환하지 않았습니다.');
  }
  return {
    success: reply.success,
    attemptId: reply.attemptId,
    terminalState: reply.terminalState as SourcingTiktokCcCollectionReply['terminalState'],
    ...(typeof reply.retryRequired === 'boolean' ? { retryRequired: reply.retryRequired } : {}),
    ...(typeof reply.attentionRequired === 'boolean' ? { attentionRequired: reply.attentionRequired } : {}),
    ...(typeof reply.errorCode === 'string' ? { errorCode: reply.errorCode } : {}),
    ...(typeof reply.error === 'string' ? { error: reply.error } : {}),
  };
}
