import type { OperationStatus, ProviderOutcome } from '@kiditem/shared/registration-execution';
import type { ThumbnailExecutionReportRequest } from '@kiditem/shared/thumbnail-execution';

/**
 * 대표이미지 몰 반영 실행의 동결 내용. 실행이 만들어질 때 한 번 정해지고 바뀌지 않는다.
 * `generationId` · `contentWorkspaceId` 는 Content 소유 기록의 id 일 뿐 외래키가 아니다.
 */
export type ThumbnailUpdatePayload = Readonly<{
  kind: 'thumbnail_update';
  generationId: string;
  contentWorkspaceId: string;
  salesProductId: string | null;
  channelListingId: string | null;
  productName: string;
  image: Readonly<{ url: string; assetId: string | null; sha256: string }>;
}>;

/**
 * 어느 쿠팡 계정의 실행인지. listing 이 있으면 그 계정, 없으면 조직의 활성 쿠팡 계정이
 * 하나일 때만 그 계정이다 — 둘 이상이면 운영자가 listing 을 골라야 한다.
 */
export type ThumbnailAccountResolution =
  | Readonly<{ ok: true; channelAccountId: string }>
  | Readonly<{ ok: false; reason: 'no_coupang_account' | 'ambiguous_coupang_account' }>;

export function resolveThumbnailAccount(input: {
  listingAccountId: string | null;
  activeCoupangAccountIds: readonly string[];
}): ThumbnailAccountResolution {
  if (input.listingAccountId) return { ok: true, channelAccountId: input.listingAccountId };
  const accounts = [...new Set(input.activeCoupangAccountIds)];
  if (accounts.length === 0) return { ok: false, reason: 'no_coupang_account' };
  if (accounts.length > 1) return { ok: false, reason: 'ambiguous_coupang_account' };
  return { ok: true, channelAccountId: accounts[0]! };
}

/**
 * 실행 멱등 키. Agent 호출은 그 호출의 owner 키로 다시 와도 같은 실행이고, 화면 호출은
 * 누를 때마다 새 실행이다(같은 생성에 살아 있는 실행이 있으면 저장소가 막는다).
 */
export function thumbnailUpdateIdempotencyKey(input: {
  generationId: string;
  ownerIdempotencyKey: string | null;
  nonce: string;
}): string {
  return input.ownerIdempotencyKey
    ? `thumbnail_update:${input.ownerIdempotencyKey}`
    : `thumbnail_update:${input.generationId}:${input.nonce}`;
}

export type ThumbnailReportTransition = Readonly<{
  status: Extract<OperationStatus, 'succeeded' | 'failed' | 'reconciling'>;
  providerOutcome: Extract<ProviderOutcome, 'succeeded' | 'definitive_failure' | 'uncertain'>;
  errorCode: 'thumbnail_rejected' | 'thumbnail_outcome_unknown' | null;
  errorMessage: string | null;
}>;

/** 몰이 받았다는 증거만 성공이다. 모르면 `reconciling` 으로 두고 다음 보고를 기다린다. */
export function thumbnailReportTransition(report: ThumbnailExecutionReportRequest): ThumbnailReportTransition {
  switch (report.outcome) {
    case 'succeeded':
      return { status: 'succeeded', providerOutcome: 'succeeded', errorCode: null, errorMessage: null };
    case 'definitive_failure':
      return { status: 'failed', providerOutcome: 'definitive_failure', errorCode: 'thumbnail_rejected', errorMessage: report.error };
    case 'uncertain':
      return { status: 'reconciling', providerOutcome: 'uncertain', errorCode: 'thumbnail_outcome_unknown', errorMessage: report.error };
    default: {
      const unreachable: never = report;
      throw new Error(`Unknown thumbnail report: ${JSON.stringify(unreachable)}`);
    }
  }
}

/** 보고를 받을 수 있는 상태. 끝난 실행에 온 보고는 거절한다(`reconciling` 은 한 번 더 받는다). */
export function acceptsThumbnailReport(status: OperationStatus): boolean {
  return status === 'executing' || status === 'reconciling';
}
