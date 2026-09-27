import { vi } from 'vitest';
import { RegistrationScopeSchema, type RegistrationScope } from '@kiditem/shared/channels-operations';
import type { OperationView } from '@kiditem/shared/operation';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';

/**
 * 등록 실행(`channels.registration`, KID-364) 호출자 스펙이 쓰는 확장 경계 가짜. 스펙은 `@/lib/extension-bridge`와
 * `@/lib/extension-auth`를 `vi.mock`해 두고 이 함수로 답을 꽂는다 — `registration-operation`(시작 · 대기)은 진짜로 돌아
 * 실제 scope가 `RegistrationScopeSchema`를 통과하는지 본다. 서버 읽기(`GET /api/operations/:id`)는 각 스펙의 apiClient
 * 가짜가 `registrationOperationResponse`로 답한다.
 */

export const REGISTRATION_OPERATION_ID = '0000000e-0000-4000-8000-00000000000e';

export interface CapturedRegistrationStart {
  kind: string;
  scope: Record<string, unknown>;
  idempotencyKey?: string;
}

/** 확장이 등록 kind와 이 몰들의 쓰기 사이트를 도는 새 빌드라고 답하고, 시작마다 `replies`를 차례로 돌려준다. */
export function fakeRegistrationExtension(
  mallKeys: readonly string[],
  replies: ReadonlyArray<Record<string, unknown>> = [],
): CapturedRegistrationStart[] {
  const starts: CapturedRegistrationStart[] = [];
  const capabilities: Record<string, boolean> = {
    operationRuntime: true,
    channelsRegistrationOperationKindV1: true,
    ...Object.fromEntries(mallKeys.map((key) => [`mallWriteSite.${key}`, true])),
  };
  vi.mocked(detectExtensionId).mockResolvedValue('extension-1');
  vi.mocked(sendToExtension).mockImplementation(async (_id, message) => {
    const body = message as Record<string, unknown>;
    if (body.action === 'ping') return { success: true, capabilities } as never;
    starts.push({
      kind: body.kind as string,
      scope: body.scope as Record<string, unknown>,
      ...(typeof body.idempotencyKey === 'string' ? { idempotencyKey: body.idempotencyKey } : {}),
    });
    return (replies[starts.length - 1] ?? { success: true, operationId: REGISTRATION_OPERATION_ID, reused: false }) as never;
  });
  return starts;
}

/** 확장에 보낸 scope가 계약 스키마를 통과한다(웹이 계약 밖의 모양을 보내지 않는다). */
export function parsedRegistrationScope(start: CapturedRegistrationStart | undefined): RegistrationScope {
  if (!start) throw new Error('확장에 보낸 시작이 없습니다.');
  return RegistrationScopeSchema.parse(start.scope);
}

/** 등록 실행 하나(`OperationView`). 기본은 확인 필요(`reconciling`). */
export function registrationOperationView(patch: Partial<OperationView> = {}): OperationView {
  return {
    id: REGISTRATION_OPERATION_ID,
    kind: 'channels.registration',
    status: 'reconciling',
    lockKeys: [],
    plan: null,
    progress: null,
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-27T09:00:00.000Z',
    finishedAt: null,
    expiresAt: '2026-09-27T09:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...patch,
  };
}

/** `GET /api/operations/:id` 응답 봉투. */
export function registrationOperationResponse(patch: Partial<OperationView> = {}) {
  return { operation: registrationOperationView(patch) };
}
