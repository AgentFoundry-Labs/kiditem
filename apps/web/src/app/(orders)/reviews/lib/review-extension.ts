// 쿠팡 상품평 수집 = 실행 kind `orders.coupang_reviews`(ADR-0025, KID-359).
// 서버 owner가 월 창을 정하고 finish 트랜잭션에서만 리뷰를 쓴다. 확장은 Wing을 읽어 청크를 올릴 뿐이다.
// 웹은 확장에 `operation.start`만 보내고, 진행·결과는 서버 `GET /api/operations`로 읽는다.

import { z } from 'zod';
import { ChannelAccountListItemSchema } from '@kiditem/shared/channel-account';
import { OperationListResponseSchema, type OperationView } from '@kiditem/shared/operation';
import {
  COUPANG_REVIEWS_KIND,
  CoupangReviewsProgressSchema,
  CoupangReviewsResultSchema,
} from '@kiditem/shared/reviews';
import { apiClient } from '@/lib/api-client';
import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';
import { KIDITEM_EXTENSION_MIN_VERSION } from '@/lib/extension-version';
import { attemptFailureText } from '@/lib/operator-error';
import { operationLoginOptions, WING_LOGIN_MALL_KEY } from '@/lib/operation-login';

export const REVIEW_EXTENSION_MIN_VERSION = KIDITEM_EXTENSION_MIN_VERSION;
/** 확장 새 런타임(KID-357)이 `operation.start`를 받는다는 ping 표시. */
export const REVIEW_OPERATION_RUNTIME_CAPABILITY = 'operationRuntime';
export const REVIEW_EXTENSION_CHROME_REQUIRED =
  '쿠팡 리뷰 수집은 Chrome 확장프로그램으로 실행됩니다. Chrome에서 이 페이지를 열어주세요.';
export const REVIEW_EXTENSION_REQUIRED =
  'KIDITEM 쿠팡 확장프로그램을 설치/새로고침한 뒤 다시 실행하세요.';
export const REVIEW_EXTENSION_RELOAD_REQUIRED = `KIDITEM 쿠팡 확장프로그램이 예전 버전입니다. chrome://extensions 에서 확장프로그램을 새로고침한 뒤 다시 실행하세요. (필요 버전 ${REVIEW_EXTENSION_MIN_VERSION}+)`;
export const REVIEW_ACCOUNT_REQUIRED = '연결된 쿠팡 계정이 없습니다. 채널 설정에서 쿠팡 Wing 계정을 먼저 연결해 주세요.';

export const REVIEW_COLLECTION_MONTH_OPTIONS = [3, 6, 12, 24] as const;
export const DEFAULT_REVIEW_COLLECTION_MONTHS = 3;
const OPERATIONS_PATH = '/api/operations';
/** 최근 실행 몇 개를 읽는다. 첫 행이 가장 최근 실행이다. */
const RECENT_OPERATIONS = 3;

export type ReviewExtensionGate =
  | { status: 'ready'; extensionId: string; version: string | null }
  | { status: 'chrome_required' }
  | { status: 'missing' }
  | { status: 'outdated'; extensionId: string; version: string | null };

interface ExtensionPingResponse {
  success?: boolean;
  version?: string;
  capabilities?: Record<string, unknown>;
}

/** 화면이 보는 한 실행. 진행은 progress.windows, 결과는 result에서 온다. */
export type ReviewCollectionStatus =
  | { status: 'idle' }
  | {
    status: 'running' | 'done' | 'error' | 'cancelled';
    operationId: string;
    /** 계획한 월 창 수. */
    total: number;
    /** 다 읽은 월 창 수. */
    completed: number;
    /** 지금 읽는 달(`YYYY-MM`). */
    current: string | null;
    /** 확장이 올린 리뷰 수. */
    collected: number;
    /** 성공한 실행에서만: 새로 넣은 리뷰·갱신한 리뷰. */
    inserted: number | null;
    updated: number | null;
    error: string | null;
  };

const OperationStartReplySchema = z.union([
  z.object({ success: z.literal(true), operationId: z.string().uuid(), reused: z.boolean() }),
  z.object({
    success: z.literal(false),
    errorCode: z.string(),
    error: z.string(),
    details: z.record(z.string(), z.unknown()).nullable().optional(),
  }),
]);

const ReviewPlanSchema = z.object({ windows: z.array(z.unknown()) }).passthrough();

export function isReviewExtensionVersionAtLeast(
  current: string | null | undefined,
  minimum: string,
): boolean {
  if (!current) return false;
  const currentParts = current.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const minimumParts = minimum.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const currentValue = currentParts[index] ?? 0;
    const minimumValue = minimumParts[index] ?? 0;
    if (currentValue > minimumValue) return true;
    if (currentValue < minimumValue) return false;
  }
  return true;
}

export async function detectReviewExtensionGate(): Promise<ReviewExtensionGate> {
  if (!isChromeExtensionRuntimeAvailable()) return { status: 'chrome_required' };
  const extensionId = await detectExtensionId();
  if (!extensionId) return { status: 'missing' };
  const ping = await sendToExtension<ExtensionPingResponse>(extensionId, { action: 'ping' }).catch(() => null);
  if (!ping?.success) return { status: 'missing' };
  const version = typeof ping.version === 'string' ? ping.version : null;
  if (
    ping.capabilities?.[REVIEW_OPERATION_RUNTIME_CAPABILITY] !== true ||
    !isReviewExtensionVersionAtLeast(version, REVIEW_EXTENSION_MIN_VERSION)
  ) {
    return { status: 'outdated', extensionId, version };
  }
  return { status: 'ready', extensionId, version };
}

export function reviewExtensionGateMessage(gate: ReviewExtensionGate): string | null {
  if (gate.status === 'chrome_required') return REVIEW_EXTENSION_CHROME_REQUIRED;
  if (gate.status === 'missing') return REVIEW_EXTENSION_REQUIRED;
  if (gate.status === 'outdated') return REVIEW_EXTENSION_RELOAD_REQUIRED;
  return null;
}

/** 상품평을 모을 쿠팡(Wing) 계정: 활성 쿠팡 계정 중 대표 계정, 없으면 첫 계정. */
export async function resolveCoupangReviewAccountId(): Promise<string> {
  const accounts = z.array(ChannelAccountListItemSchema).parse(await apiClient.get<unknown>('/api/channels/accounts'));
  const coupang = accounts.filter((account) => account.channel === 'coupang');
  const account = coupang.find((candidate) => candidate.isPrimary) ?? coupang[0];
  if (!account) throw new Error(REVIEW_ACCOUNT_REQUIRED);
  return account.id;
}

/**
 * 확장에 실행 시작을 맡긴다. 확장이 begin에 성공하면 바로 실행 id를 돌려준다(수집은 확장에서 계속).
 * 같은 계정의 실행이 이미 돌고 있으면 그 실행 id를 돌려줘 화면이 이어서 본다.
 */
export async function startCoupangReviewCollection(
  extensionId: string,
  scope: { channelAccountId: string; months: number },
  idempotencyKey: string,
): Promise<string> {
  // 로그인 화면이면 확장이 윙 저장 자격으로 로그인한다(KID-377).
  const reply = OperationStartReplySchema.parse(await sendToExtension<unknown>(extensionId, {
    action: 'operation.start',
    kind: COUPANG_REVIEWS_KIND,
    scope,
    idempotencyKey,
    ...(await operationLoginOptions(WING_LOGIN_MALL_KEY)),
  }));
  if (reply.success) return reply.operationId;
  const existing = reply.details?.existing as { operationId?: unknown; kind?: unknown } | null | undefined;
  if (reply.errorCode === 'OPERATION_IN_PROGRESS' && existing?.kind === COUPANG_REVIEWS_KIND && typeof existing.operationId === 'string') {
    return existing.operationId;
  }
  throw new Error(reply.error || '쿠팡 리뷰 수집을 시작하지 못했습니다.');
}

/** 가장 최근 상품평 실행. 없으면 idle. */
export async function readLatestCoupangReviewCollection(): Promise<ReviewCollectionStatus> {
  const { operations } = OperationListResponseSchema.parse(
    await apiClient.get<unknown>(`${OPERATIONS_PATH}?kinds=${COUPANG_REVIEWS_KIND}&limit=${RECENT_OPERATIONS}`),
  );
  const [latest] = operations;
  return latest ? toStatus(latest) : { status: 'idle' };
}

export async function cancelCoupangReviewCollection(operationId: string): Promise<void> {
  await apiClient.post(`${OPERATIONS_PATH}/${encodeURIComponent(operationId)}/cancel`);
}

function toStatus(operation: OperationView): ReviewCollectionStatus {
  const progress = CoupangReviewsProgressSchema.safeParse(operation.progress);
  const windows = progress.success ? progress.data.windows : [];
  const plan = ReviewPlanSchema.safeParse(operation.plan);
  const result = CoupangReviewsResultSchema.safeParse(operation.result);
  return {
    status: operation.status === 'succeeded'
      ? 'done'
      : operation.status === 'failed'
        ? 'error'
        : operation.status === 'cancelled'
          ? 'cancelled'
          : 'running',
    operationId: operation.id,
    total: plan.success ? plan.data.windows.length : 0,
    completed: windows.filter((window) => window.done).length,
    current: progress.success ? progress.data.current : null,
    collected: windows.reduce((sum, window) => sum + window.items, 0),
    inserted: result.success ? result.data.inserted : null,
    updated: result.success ? result.data.updated : null,
    error: operation.status === 'failed' ? attemptFailureText(operation, 'coupang_reviews') ?? '리뷰 수집에 실패했습니다.' : null,
  };
}
