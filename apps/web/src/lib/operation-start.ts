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
/** `operation.start`의 loginBlocked(차단으로 자격을 싣지 않음, 실기기 R7)를 받는 빌드의 표시. */
export const OPERATION_LOGIN_BLOCKED_CAPABILITY = 'operationLoginBlockedV1' as const;

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

/** 확장·서버가 시작을 거절했다. `code`는 서버 등록 코드, `reason`은 `details.reason ?? code` — 화면은 문장이 아니라 이 값으로 가른다. */
export class OperationStartFailure extends Error {
  readonly code: string | null;
  /** 거절 봉투의 `details`(예: `{ reason: 'ambiguous_listing' }`). 없으면 빈 객체. */
  readonly details: Readonly<Record<string, unknown>>;

  constructor(message: string, code: string | null, details: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'OperationStartFailure';
    this.code = code;
    this.details = details ?? {};
  }

  /** 화면이 가를 까닭: `details.reason`이 있으면 그것, 없으면 등록 코드. */
  get reason(): string | null {
    return typeof this.details.reason === 'string' ? this.details.reason : this.code;
  }
}

type StartReply =
  | { success: true; operationId: string; reused: boolean }
  | { success: false; errorCode?: string; error?: string; details?: ({ existing?: { operationId?: unknown } | null } & Record<string, unknown>) | null };

async function extensionWithRuntime(capability: string | readonly string[]): Promise<{ extensionId: string; acceptsLogin: boolean; acceptsLoginBlocked: boolean }> {
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error(EXTENSION_MISSING);
  const ping = await sendToExtension<PingReply>(extensionId, { action: 'ping' });
  const required = typeof capability === 'string' ? [capability] : capability;
  if (ping?.success !== true || ping.capabilities?.[OPERATION_RUNTIME_CAPABILITY] !== true
    || required.some((name) => ping.capabilities?.[name] !== true)) {
    throw new Error(OPERATION_RUNTIME_UPDATE_REQUIRED);
  }
  await transferExtensionAuthTo(extensionId);
  return {
    extensionId,
    acceptsLogin: ping.capabilities?.[OPERATION_LOGIN_CAPABILITY] === true,
    acceptsLoginBlocked: ping.capabilities?.[OPERATION_LOGIN_BLOCKED_CAPABILITY] === true,
  };
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
   * `capability`: 이 kind를 도는 빌드가 `ping`에 싣는 표시(없으면 런타임 표시만 본다). 여럿이면 모두 있어야 한다
   * (등록 kind 표시 + 그 몰의 쓰기 사이트 `mallWriteSite.<key>`, KID-364). `idempotencyKey`: 같은 시작을
   * 다시 보내도 같은 실행을 돌려받는다(끊긴 답을 되풀이할 때). `credentials`: 사이트 자동 로그인에 쓸 그 몰의 저장 자격 —
   * 확장 메시지에만 싣고 확장은 그 실행 동안만 쥔다(KID-377, `operation-login`). `loginBlocked`: 그 몰의 자동 로그인 차단 때문에
   * 자격을 싣지 않았다(실기기 R7).
   */
  options: { capability?: string | readonly string[]; idempotencyKey?: string; credentials?: OperationLoginCredentials; loginBlocked?: boolean } = {},
): Promise<OperationStartOutcome> {
  const { extensionId, acceptsLogin, acceptsLoginBlocked } = await extensionWithRuntime(options.capability ?? OPERATION_RUNTIME_CAPABILITY);
  const reply = await sendToExtension<StartReply>(
    extensionId,
    {
      action: 'operation.start',
      kind,
      scope,
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      // 옛 빌드(operationLoginV1 없음)에는 싣지 않는다 — 자격 없이 시작하고 로그인 화면이면 탭을 남긴다.
      ...(options.credentials && acceptsLogin ? { credentials: options.credentials } : {}),
      // 차단 때문에 자격을 싣지 않았다 — 확장이 로그인 화면에서 멈추면 까닭을 blocked로 적는다(실기기 R7).
      ...(options.loginBlocked && !options.credentials && acceptsLoginBlocked ? { loginBlocked: true } : {}),
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
  throw new OperationStartFailure(operatorReason(failure?.error, START_FAILED), failure?.errorCode ?? null, failure?.details ?? null);
}

/** 이 브라우저에서 돌고 있는 실행을 멈춘다(`operation.cancel` — 확장이 서버 cancel도 부른다). */
export async function requestOperationCancel(operationId: string): Promise<unknown> {
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error(EXTENSION_MISSING);
  const reply = await sendToExtension<{ success?: boolean; error?: string }>(extensionId, { action: 'operation.cancel', operationId });
  if (reply?.success !== true) throw new Error(operatorReason(reply?.error, CANCEL_FAILED));
  return reply;
}
