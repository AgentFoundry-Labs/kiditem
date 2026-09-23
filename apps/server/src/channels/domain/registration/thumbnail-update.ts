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
 * Wing 에서 상품을 찾는 이름. 쿠팡 listing 이름이 있으면 그 이름(URL 인코딩은 두 번까지 푼다),
 * 없으면 작업공간 이름이다. 둘 다 비면 빈 문자열이고 호출자가 거절한다.
 */
export function thumbnailProductName(listingChannelName: string | null, workspaceDisplayName: string | null): string {
  const listingName = listingChannelName?.trim();
  return decodeProductName(listingName || workspaceDisplayName || '');
}

function decodeProductName(value: string): string {
  let current = value.trim();
  if (!/%[0-9A-Fa-f]{2}/.test(current)) return current;
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(current).trim();
      if (decoded === current) return decoded;
      current = decoded;
    } catch {
      return current;
    }
  }
  return current;
}

/**
 * 어느 쿠팡 계정의 실행인지. listing 이 있으면 그 계정이다. 판매상품에 쿠팡 listing 이 여럿이면
 * 고르지 않고 거절한다(운영자가 listing 을 고른다). listing 이 하나도 없을 때만 조직의 활성 쿠팡
 * 계정이 하나인지 본다 — 둘 이상이면 역시 listing 을 골라야 한다.
 */
export type ThumbnailAccountResolution =
  | Readonly<{ ok: true; channelAccountId: string }>
  | Readonly<{ ok: false; reason: 'no_coupang_account' | 'ambiguous_coupang_account' | 'ambiguous_coupang_listing' }>;

export function resolveThumbnailAccount(input: {
  listingAccountId: string | null;
  /** 고르지 않았을 때 판매상품의 살아 있는 쿠팡 listing 수. 모르면 0 으로 본다. */
  productListingCount?: number;
  activeCoupangAccountIds: readonly string[];
}): ThumbnailAccountResolution {
  if (input.listingAccountId) return { ok: true, channelAccountId: input.listingAccountId };
  if ((input.productListingCount ?? 0) > 1) return { ok: false, reason: 'ambiguous_coupang_listing' };
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
  errorCode: 'thumbnail_rejected' | 'thumbnail_outcome_unknown' | 'thumbnail_awaiting_confirmation' | null;
  errorMessage: string | null;
}>;

export const THUMBNAIL_AWAITING_CONFIRMATION_MESSAGE = 'Wing 수정 화면에 올렸습니다 — Wing에서 저장한 뒤 반영됨으로 표시하세요';

/**
 * 확장 · runner 보고의 전이. 올린 것은 저장이 아니므로 성공이 아니다 — 운영자 확인을 기다리는
 * `reconciling` 이다. 성공은 운영자 확인(`thumbnailConfirmationTransition`)으로만 된다.
 */
export function thumbnailReportTransition(report: ThumbnailExecutionReportRequest): ThumbnailReportTransition {
  switch (report.outcome) {
    case 'uploaded_pending_save':
      return {
        status: 'reconciling',
        providerOutcome: 'uncertain',
        errorCode: 'thumbnail_awaiting_confirmation',
        errorMessage: THUMBNAIL_AWAITING_CONFIRMATION_MESSAGE,
      };
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
export const THUMBNAIL_REPORTABLE_STATUSES = ['executing', 'reconciling'] as const satisfies readonly OperationStatus[];

export function acceptsThumbnailReport(status: OperationStatus): boolean {
  return (THUMBNAIL_REPORTABLE_STATUSES as readonly OperationStatus[]).includes(status);
}

/**
 * 운영자의 "반영됨으로 표시". Wing 에서 저장한 것을 사람이 확인한 것만 성공이다. 올린 뒤 기다리는
 * (`reconciling`) 실행만 받는다 — 아직 올리지도 않은 `executing` 은 확인할 것이 없다.
 */
export const THUMBNAIL_CONFIRMABLE_STATUSES = ['reconciling'] as const satisfies readonly OperationStatus[];

export function thumbnailConfirmationTransition(): ThumbnailReportTransition {
  return { status: 'succeeded', providerOutcome: 'succeeded', errorCode: null, errorMessage: null };
}
