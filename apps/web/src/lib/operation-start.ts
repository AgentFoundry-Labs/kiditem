'use client';

import { transferExtensionAuthTo } from './extension-auth';
import { detectExtensionId, sendToExtension } from './extension-bridge';
import { operatorReason } from './operator-error';
import type { OperationKind } from '@kiditem/shared/operation';
import type { OperationLoginCredentials } from './operation-login';

/** 확장 새 런타임이 `ping` capabilities에 싣는 표시(KID-357). */
export const OPERATION_RUNTIME_CAPABILITY = 'operationRuntime' as const;
/** `operation.start`의 credentials(사이트 자동 로그인, KID-377)를 받는 빌드의 표시. 옛 빌드는 그 칸이 있는 시작을 거절한다. */
export const OPERATION_LOGIN_CAPABILITY = 'operationLoginV1' as const;

type PingReply = { success?: boolean; capabilities?: Record<string, unknown> };

const EXTENSION_MISSING = '브라우저 수집 익스텐션을 찾을 수 없습니다.';
export const OPERATION_RUNTIME_UPDATE_REQUIRED = '확장 프로그램을 업데이트해 주세요.';
const START_FAILED = '확장 프로그램이 실행을 시작하지 못했습니다.';
const CANCEL_FAILED = '확장 프로그램이 실행을 멈추지 못했습니다.';
/** 확장은 begin이 성공하면 바로 답한다(수집은 뒤에서 계속). */
const START_REPLY_TIMEOUT_MS = 60_000;

export type OperationStartOutcome =
  | Readonly<{ outcome: 'started'; operationId: string }>
  | Readonly<{ outcome: 'running'; operationId: string | null }>
  /** `existingOperationId`: 잠금을 쥔 실행(확장이 거절에 실어 줄 때만). */
  | Readonly<{ outcome: 'refused'; message: string; existingOperationId?: string | null }>;

type StartReply =
  | { success: true; operationId: string; reused: boolean }
  | { success: false; errorCode?: string; error?: string; details?: { existing?: { operationId?: unknown } | null } | null };

async function extensionWithRuntime(capability: string): Promise<{ extensionId: string; acceptsLogin: boolean }> {
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error(EXTENSION_MISSING);
  const ping = await sendToExtension<PingReply>(extensionId, { action: 'ping' });
  if (ping?.success !== true || ping.capabilities?.[OPERATION_RUNTIME_CAPABILITY] !== true
    || ping.capabilities?.[capability] !== true) {
    throw new Error(OPERATION_RUNTIME_UPDATE_REQUIRED);
  }
  await transferExtensionAuthTo(extensionId);
  return { extensionId, acceptsLogin: ping.capabilities?.[OPERATION_LOGIN_CAPABILITY] === true };
}

/** 이 확장이 `operation.start`의 credentials를 받는가(`operationLoginV1`). 답이 없으면 받지 않는 것으로 본다. */
export async function extensionAcceptsOperationLogin(extensionId: string): Promise<boolean> {
  const ping = await sendToExtension<PingReply>(extensionId, { action: 'ping' }).catch(() => null);
  return ping?.success === true && ping.capabilities?.[OPERATION_LOGIN_CAPABILITY] === true;
}

/**
 * 확장에 실행 kind 하나를 시작시킨다(`operation.start`). 확장은 begin이 끝나면 곧바로 답하고 수집은 뒤에서 계속된다.
 * 진행·완료는 화면이 `GET /api/operations`로 본다. 같은 잠금의 실행이 이미 돌면(OPERATION_IN_PROGRESS) 서버 문장 그대로
 * 거절을 돌려준다.
 */
export async function requestOperationStart(
  kind: OperationKind,
  scope: Record<string, unknown>,
  /**
   * `capability`: 이 kind를 도는 빌드가 `ping`에 싣는 표시(없으면 런타임 표시만 본다). `idempotencyKey`: 같은 시작을
   * 다시 보내도 같은 실행을 돌려받는다(끊긴 답을 되풀이할 때). `credentials`: 사이트 자동 로그인에 쓸 그 몰의 저장 자격 —
   * 확장 메시지에만 싣고 확장은 그 실행 동안만 쥔다(KID-377, `operation-login`).
   */
  options: { capability?: string; idempotencyKey?: string; credentials?: OperationLoginCredentials } = {},
): Promise<OperationStartOutcome> {
  const { extensionId, acceptsLogin } = await extensionWithRuntime(options.capability ?? OPERATION_RUNTIME_CAPABILITY);
  const reply = await sendToExtension<StartReply>(
    extensionId,
    {
      action: 'operation.start',
      kind,
      scope,
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      // 옛 빌드(operationLoginV1 없음)에는 싣지 않는다 — 자격 없이 시작하고 로그인 화면이면 탭을 남긴다.
      ...(options.credentials && acceptsLogin ? { credentials: options.credentials } : {}),
    },
    START_REPLY_TIMEOUT_MS,
  );
  if (reply?.success === true && typeof reply.operationId === 'string') {
    return reply.reused ? { outcome: 'running', operationId: reply.operationId } : { outcome: 'started', operationId: reply.operationId };
  }
  const failure = reply && reply.success === false ? reply : null;
  if (failure?.errorCode === 'OPERATION_IN_PROGRESS') {
    const existing = failure.details?.existing?.operationId;
    return {
      outcome: 'refused',
      message: operatorReason(failure.error, '같은 대상의 다른 실행이 진행 중입니다.'),
      ...(typeof existing === 'string' ? { existingOperationId: existing } : {}),
    };
  }
  throw new Error(operatorReason(failure?.error, START_FAILED));
}

/** 이 브라우저에서 돌고 있는 실행을 멈춘다(`operation.cancel` — 확장이 서버 cancel도 부른다). */
export async function requestOperationCancel(operationId: string): Promise<unknown> {
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error(EXTENSION_MISSING);
  const reply = await sendToExtension<{ success?: boolean; error?: string }>(extensionId, { action: 'operation.cancel', operationId });
  if (reply?.success !== true) throw new Error(operatorReason(reply?.error, CANCEL_FAILED));
  return reply;
}
