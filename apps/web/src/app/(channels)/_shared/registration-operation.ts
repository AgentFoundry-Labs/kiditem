'use client';

import type { z } from 'zod';
import {
  CHANNELS_REGISTRATION_OPERATION_CAPABILITY,
  REGISTRATION_KIND,
  RegistrationResultSchema,
  RegistrationScopeSchema,
  type RegistrationConfirmRequest,
  type RegistrationResult,
} from '@kiditem/shared/channels-operations';
import {
  OperationFinishResponseSchema,
  OperationListResponseSchema,
  type OperationListResponse,
  type OperationView,
} from '@kiditem/shared/operation';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { operationLoginOptions } from '@/lib/operation-login';
import { requestOperationStart } from '@/lib/operation-start';
import { attemptFailureText } from '@/lib/operator-error';

/**
 * 몰 쓰기 = 등록 실행 `channels.registration` 하나(KID-364·256, ADR-0014·0019·0025).
 *
 * 등록·수정·구성 변경·품절·재개·가격·썸네일은 모두 이 파일의 `startRegistrationOperation`으로 시작한다. 웹은 scope만
 * 보내고, 서버 owner가 대상·계정·버전을 확인해 payload를 얼리며(plan), 확장 몰 쓰기 모듈이 그 plan으로 몰 화면을 채운다.
 * [등록]을 누르는 관문은 확장 한 곳이다 — `submit`은 그 관문의 첫 조건일 뿐이다(ADR-0019). 결과는
 * `GET /api/operations/:id`로 읽고, 몰에 제출됐지만 결과를 못 읽은 실행(`reconciling`)은 운영자가 몰에서 읽은
 * 등록상품ID로 확인하거나 "등록되지 않음"으로 닫는다(KID-218).
 *
 * 같은 대상·리스팅으로 두 번 보내지 않는 것은 서버 잠금 키가 지킨다. 막힌 이유를 사람이 읽는 자리는 여기 하나다.
 */

/** 몰 하나의 쓰기 모듈이 있는 확장 빌드가 `ping`에 싣는 표시. */
export function mallWriteSiteCapability(mallKey: string): string {
  return `mallWriteSite.${mallKey}`;
}

const MALL_WRITE_SITE_PREFIX = 'mallWriteSite.';
const REGISTRATION_SCOPE_INVALID = '보낼 내용이 올바르지 않습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.';
const PING_TIMEOUT_MS = 1_500;

/**
 * 시작 scope(`RegistrationScopeSchema`, idempotencyKey는 따로). executionKind별 모양:
 * - 등록 대상 경로(register·update·composition_change·가격): `registrationTargetId` + `expectedVersion` + `form`(몰별 폼 지시).
 * - 빠른 등록: `register` + `sourceProductId` + `channelAccountId` + `form`, `submit` false(대상 없이 폼만 채운다).
 * - 품절·재개: 몰 계정 하나의 리스팅 묶음 = 실행 하나(`channelAccountId` + `items`, 옛 일괄 품절과 같다).
 * - 썸네일: `salesProductId`(+ `channelListingId`·`assetId`).
 */
export type RegistrationOperationScope = Omit<z.input<typeof RegistrationScopeSchema>, 'idempotencyKey'>;

export interface StartRegistrationOperationInput {
  /** 쓰기 사이트·저장 자격을 고르는 몰 키(채널 레지스트리 철자). 서버 plan의 `mallKey`와 같다. */
  mallKey: string;
  /** 같은 시작을 다시 보내면 같은 실행을 돌려받는다(끊긴 답을 되풀이할 때). */
  idempotencyKey: string;
  scope: RegistrationOperationScope;
  /** 스스로 도는 호출이면 자동 로그인 간격을 지킨다. 사람이 누른 것은 false. */
  automatic?: boolean;
}

export interface RegistrationOperationStarted {
  operationId: string;
  /** 같은 idempotencyKey의 실행이 이미 돌고 있었다. */
  reused: boolean;
}

/** 같은 대상·리스팅의 실행이 이미 있다(`OPERATION_IN_PROGRESS`). 다시 보내지 않고 그 실행을 보여 준다. */
export class RegistrationOperationInProgress extends Error {
  readonly existingOperationId: string | null;

  constructor(message: string, existingOperationId: string | null) {
    super(message);
    this.name = 'RegistrationOperationInProgress';
    this.existingOperationId = existingOperationId;
  }
}

export function newRegistrationIdempotencyKey(prefix = 'registration'): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  return cryptoApi?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 확장에 등록 실행 하나를 시작시킨다. 그 몰의 쓰기 사이트(`mallWriteSite.<key>`)와 등록 kind 표시가 모두 있는 빌드에만
 * 보낸다 — 없으면 업데이트 문장으로 거절한다. 그 몰의 저장 자격은 `operation.start` 메시지에만 싣고(확장은 그 실행 동안만
 * 쥔다), 서버·plan·결과에는 가지 않는다(KID-377).
 */
export async function startRegistrationOperation(input: StartRegistrationOperationInput): Promise<RegistrationOperationStarted> {
  const parsed = RegistrationScopeSchema.safeParse({ ...input.scope, idempotencyKey: input.idempotencyKey });
  if (!parsed.success) throw new Error(REGISTRATION_SCOPE_INVALID);
  const scope = parsed.data;
  const outcome = await requestOperationStart(REGISTRATION_KIND, scope, {
    capability: [CHANNELS_REGISTRATION_OPERATION_CAPABILITY, mallWriteSiteCapability(input.mallKey)],
    idempotencyKey: input.idempotencyKey,
    ...(await operationLoginOptions(input.mallKey, { automatic: input.automatic ?? false })),
  });
  if (outcome.outcome === 'refused') {
    throw new RegistrationOperationInProgress(outcome.message, outcome.existingOperationId ?? null);
  }
  if (!outcome.operationId) throw new Error('확장 프로그램이 실행 번호를 알려 주지 않았습니다. 잠시 후 다시 확인해 주세요.');
  return { operationId: outcome.operationId, reused: outcome.outcome === 'running' };
}

/**
 * 몰 쓰기 사이트가 있는 몰 키(옛 `detectMallFormSubmitMalls` 자리). 등록 kind를 도는 빌드만 센다. 답이 없으면 빈 목록 —
 * 버튼은 확장이 할 수 있는 몰에서만 선다.
 */
export async function extensionMallWriteSites(): Promise<string[]> {
  const extensionId = await detectExtensionId().catch(() => null);
  if (!extensionId) return [];
  const ping = await sendToExtension<{ success?: boolean; capabilities?: Record<string, unknown> }>(
    extensionId,
    { action: 'ping' },
    PING_TIMEOUT_MS,
  ).catch(() => null);
  const capabilities = ping?.success === true ? ping.capabilities ?? {} : {};
  if (capabilities[CHANNELS_REGISTRATION_OPERATION_CAPABILITY] !== true) return [];
  return Object.entries(capabilities)
    .filter(([name, value]) => name.startsWith(MALL_WRITE_SITE_PREFIX) && value === true)
    .map(([name]) => name.slice(MALL_WRITE_SITE_PREFIX.length));
}

// ── 결과 읽기 ───────────────────────────────────────────────────────────────────

/**
 * 화면이 쓰는 등록 실행 상태. `needs_confirmation`은 `reconciling` — 몰에 제출됐지만 등록상품ID를 못 읽었다. 실패가
 * 아니고 성공도 아니다: 운영자가 몰에서 읽은 ID로 확인하거나 "등록되지 않음"으로 닫는다.
 */
export type RegistrationOperationState = 'running' | 'needs_confirmation' | 'confirmed' | 'failed' | 'cancelled';

export const REGISTRATION_OPERATION_STATE_LABEL: Record<RegistrationOperationState, string> = {
  running: '진행 중',
  needs_confirmation: '확인 필요',
  confirmed: '확인 완료',
  failed: '실패',
  cancelled: '멈춤',
};

export interface RegistrationOperationRead {
  operation: OperationView;
  state: RegistrationOperationState;
  label: string;
  /** 실행 `result`(없거나 모양이 다르면 null). */
  result: RegistrationResult | null;
  /** 실패·멈춤의 운영자 문장. */
  message: string | null;
}

export function registrationOperationState(operation: OperationView): RegistrationOperationState {
  switch (operation.status) {
    case 'reconciling': return 'needs_confirmation';
    case 'succeeded': return 'confirmed';
    case 'failed': return 'failed';
    case 'cancelled': return 'cancelled';
    default: return 'running';
  }
}

export function describeRegistrationOperation(operation: OperationView): RegistrationOperationRead {
  const state = registrationOperationState(operation);
  const parsed = operation.result ? RegistrationResultSchema.safeParse(operation.result) : null;
  const message = state === 'failed' || state === 'cancelled'
    ? attemptFailureText(operation, REGISTRATION_KIND) ?? '몰에 보내지 못했습니다.'
    : null;
  return {
    operation,
    state,
    label: REGISTRATION_OPERATION_STATE_LABEL[state],
    result: parsed?.success ? parsed.data : null,
    message,
  };
}

/** 실행 하나(`GET /api/operations/:id`). */
export async function readRegistrationOperation(operationId: string): Promise<RegistrationOperationRead> {
  const { operation } = OperationFinishResponseSchema.parse(
    await apiClient.get(`/api/operations/${encodeURIComponent(operationId)}`),
  );
  if (operation.kind !== REGISTRATION_KIND) throw new Error('등록 실행이 아닙니다.');
  return describeRegistrationOperation(operation);
}

/** 시작한 화면이 결과를 기다리는 상한. 폼 채우기·이미지 올리기까지 감안한다. */
const WAIT_LIMIT_MS = 190_000;
const POLL_MS = 2_000;

/**
 * 실행이 진행 중이 아닐 때까지 그 실행 하나를 2초마다 읽는다. `reconciling`에서 멈춘다 — 그 뒤는 운영자 확인이다.
 * 상한을 넘기면 `running`을 돌려준다(실행은 확장에서 계속되고 화면은 목록·이력으로 이어서 본다).
 */
export async function waitForRegistrationOperation(
  operationId: string,
  options: {
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    timeoutMs?: number;
    pollMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<RegistrationOperationRead> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + (options.timeoutMs ?? WAIT_LIMIT_MS);
  for (;;) {
    options.signal?.throwIfAborted();
    const read = await readRegistrationOperation(operationId);
    if (read.state !== 'running' || now() >= deadline) return read;
    await sleep(options.pollMs ?? POLL_MS);
  }
}

// ── 확인 · 닫기 (KID-218) ──────────────────────────────────────────────────────────

const operationPath = (operationId: string, action: 'confirm' | 'close') =>
  `/api/channels/registration-operations/${encodeURIComponent(operationId)}/${action}`;

/** 몰에서 읽은 등록상품ID로 `reconciling` 실행을 확인한다. 같은 조직의 운영자면 누구나(리더 가정 KID-329 (a)). */
export async function confirmRegistrationOperation(
  operationId: string,
  input: { externalListingId: string; observedUrl?: string; options?: RegistrationConfirmRequest['options'] },
): Promise<RegistrationOperationRead | null> {
  const externalListingId = input.externalListingId.trim();
  if (!externalListingId) throw new Error('등록상품ID를 입력해 주세요.');
  const body: RegistrationConfirmRequest = {
    externalListingId,
    ...(input.observedUrl?.trim() ? { observedUrl: input.observedUrl.trim() } : {}),
    ...(input.options && input.options.length > 0 ? { options: input.options } : {}),
  };
  return readResolved(await apiClient.post<unknown>(operationPath(operationId, 'confirm'), body));
}

const NOT_REGISTERED_REASON = '운영자가 몰에서 확인: 등록되지 않음';

/** 몰에서 확인해 보니 등록되지 않았다 — `reconciling` 실행을 실패로 닫는다. */
export async function closeRegistrationOperation(
  operationId: string,
  reason: string = NOT_REGISTERED_REASON,
): Promise<RegistrationOperationRead | null> {
  return readResolved(await apiClient.post<unknown>(operationPath(operationId, 'close'), { reason }));
}

function readResolved(response: unknown): RegistrationOperationRead | null {
  const parsed = OperationFinishResponseSchema.safeParse(response);
  return parsed.success ? describeRegistrationOperation(parsed.data.operation) : null;
}

// ── 목록 (`/mall-tasks`) ──────────────────────────────────────────────────────────

export const registrationOperationKeys = {
  all: ['registration-operations'] as const,
  list: (limit: number) => ['registration-operations', 'list', limit] as const,
  detail: (operationId: string) => ['registration-operations', 'detail', operationId] as const,
};

/** 등록 실행 목록(가장 최근 먼저). 화면 하나가 조회 하나로 본다. */
export async function listRegistrationOperations(limit = 50): Promise<OperationListResponse> {
  return OperationListResponseSchema.parse(await apiClient.get(`/api/operations?kinds=${REGISTRATION_KIND}&limit=${limit}`));
}
