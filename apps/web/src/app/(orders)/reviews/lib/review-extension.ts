// coupang-ads-scraper 확장의 쿠팡 상품평 수집 액션 래퍼.
// runCoupangReviewCollection(시작) / getCoupangReviewCollectionStatus(폴링) /
// cancelCoupangReviewCollection(중단). 확장은 Wing 상품평 화면을 크롤링해
// /api/reviews/ingest 로 넘기기만 하고, listing 매칭·집계는 서버가 담당한다.

import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';
import { KIDITEM_EXTENSION_MIN_VERSION } from '@/lib/extension-version';

// 통합 확장(kiditem-os)이 버전을 1.0.0 으로 리셋했으므로 버전은 하한만 지키고,
// 실제 게이트는 `coupangReviewCollection` capability 로 판정한다. 구버전 확장에는
// 그 플래그가 없으므로 capability 만으로도 스테일 설치를 걸러낸다.
// 통합 확장(kiditem-os)은 세 확장을 합치며 버전을 1.0.0 으로 리셋했다. 개별
// 기능 판정은 아래 ping capability 가 하고, 버전은 병합 이전 설치만 걸러낸다.
export const REVIEW_EXTENSION_MIN_VERSION = KIDITEM_EXTENSION_MIN_VERSION;

export const REVIEW_EXTENSION_CHROME_REQUIRED =
  '쿠팡 리뷰 수집은 Chrome 확장프로그램으로 실행됩니다. Chrome에서 이 페이지를 열어주세요.';
export const REVIEW_EXTENSION_REQUIRED =
  'KIDITEM 쿠팡 확장프로그램을 설치/새로고침한 뒤 다시 실행하세요.';
export const REVIEW_EXTENSION_RELOAD_REQUIRED = `KIDITEM 쿠팡 확장프로그램이 예전 버전입니다. chrome://extensions 에서 확장프로그램을 새로고침한 뒤 다시 실행하세요. (필요 버전 ${REVIEW_EXTENSION_MIN_VERSION}+)`;

/** Wing 이 1개월 단위 조회만 허용해서 개월 수가 곧 요청 횟수다. */
export const REVIEW_COLLECTION_MONTH_OPTIONS = [3, 6, 12, 24] as const;
export const DEFAULT_REVIEW_COLLECTION_MONTHS = 3;

export type ReviewExtensionGate =
  | { status: 'ready'; extensionId: string; version: string | null }
  | { status: 'chrome_required' }
  | { status: 'missing' }
  | { status: 'outdated'; extensionId: string; version: string | null };

interface ExtensionPingResponse {
  success?: boolean;
  version?: string;
  capabilities?: { coupangReviewCollection?: boolean };
}

export interface ReviewCollectionStatus {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled' | string;
  runId?: string | null;
  months?: number;
  /** 조회해야 할 월 구간 수. */
  total?: number;
  completed?: number;
  /** 크롤링해 서버로 넘긴 상품평 건수. */
  collected?: number;
  created?: number;
  updated?: number;
  linked?: number;
  unlinked?: number;
  current?: string | null;
  failures?: Array<{ month: string; error: string }>;
  error?: string | null;
  cancelRequested?: boolean;
  startedAt?: number;
  endedAt?: number | null;
}

export interface StartReviewCollectionResponse extends ReviewCollectionStatus {
  success?: boolean;
  started?: boolean;
}

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

  const ping = await sendToExtension<ExtensionPingResponse>(extensionId, {
    action: 'ping',
  }).catch(() => null);
  if (!ping?.success) return { status: 'missing' };

  const version = typeof ping.version === 'string' ? ping.version : null;
  if (
    !ping.capabilities?.coupangReviewCollection ||
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

/** 즉시 runId 를 반환하고, 진행률은 status 폴링으로 본다. */
export async function runCoupangReviewCollection(
  extensionId: string,
  months: number,
): Promise<StartReviewCollectionResponse> {
  const response = await sendToExtension<StartReviewCollectionResponse>(extensionId, {
    action: 'runCoupangReviewCollection',
    months,
  });
  if (!response?.success) {
    throw new Error(response?.error ?? '쿠팡 리뷰 수집 시작 실패');
  }
  return response;
}

export async function getCoupangReviewCollectionStatus(
  extensionId: string,
  runId?: string | null,
): Promise<ReviewCollectionStatus> {
  const response = await sendToExtension<ReviewCollectionStatus>(extensionId, {
    action: 'getCoupangReviewCollectionStatus',
    ...(runId ? { runId } : {}),
  });
  return response ?? { status: 'idle' };
}

export async function cancelCoupangReviewCollection(
  extensionId: string,
  runId?: string | null,
): Promise<void> {
  await sendToExtension(extensionId, {
    action: 'cancelCoupangReviewCollection',
    ...(runId ? { runId } : {}),
  });
}
