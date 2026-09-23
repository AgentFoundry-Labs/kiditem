import type {
  ThumbnailExecutionListingChoice,
  ThumbnailExecutionPrepareResponse,
  ThumbnailExecutionReportRequest,
  ThumbnailExecutionResult,
  ThumbnailExecutionStatus,
} from '@kiditem/shared/thumbnail-execution';

export const CHANNELS_THUMBNAIL_EXECUTION_PORT = Symbol('CHANNELS_THUMBNAIL_EXECUTION_PORT');

/**
 * 대표이미지 몰 반영의 유일한 소유자. 실행은 `ProductRegistrationExecution`
 * (`executionKind = 'thumbnail_update'`) 한 줄이고 Content 는 판매 상품의 대표이미지 자산만 준다. 올릴 자산은
 * 요청이 고른 것, 아니면 그 계정 등록 대상이 고른 것, 아니면 작업공간의 현재 대표이미지다(KID-313 W3a).
 *
 * - `prepare` 는 확장 경로다: 실행을 `executing` 으로 만들고 확장에 넘길 사진을 돌려준다.
 *   같은 (판매 상품, 계정, 자산)에 살아 있는 실행(`prepared` · `executing` · `reconciling`)이 있으면 409.
 * - `report` 는 확장 결과를 받는다. 끝난 실행에 온 보고는 409, `reconciling` 은 한 번 더 받는다.
 *   몰 수정 화면에 올린 보고(`uploaded_pending_save`)도 성공이 아니라 `reconciling` 이다.
 * - `confirmApplied` 는 운영자의 "반영됨으로 표시" 다. `reconciling` 에서만 받고 성공으로 가는 유일한 길이다.
 * - `runOnServer` 는 Agent 경로다(개발 서버 전용 Playwright, 운영에서는 503). 올린 결과는 운영자
 *   확인을 기다리는 영수증(`status: 'reconciling'`)이다. owner 키가 같으면 기록된 결과를 다시 돌려준다.
 * - `listLatest` 는 판매 상품마다 가장 최근 실행이다. 운영자가 치운 실패는 빠진다.
 * - `dismissFailed` 는 가장 최근 실패를 화면에서 치운다(`resultJson.dismissedAt`). 행은 지우지 않는다.
 * - `resend` 는 결과를 모르는 실행(`executing` · `reconciling`)의 동결 사진을 확장에 다시 보낼 수 있게
 *   돌려준다. 같은 실행이고 보고는 `report` 로 한다.
 * - `markNotApplied` 는 운영자가 "반영 안 됨으로 표시" 한 것이다. 살아 있는 실행만 받고
 *   `definitive_failure` 로 끝내 같은 자산에 새 반영을 연다. 성공은 기록하지 않는다.
 *
 * 실행 행의 `channelListingId` 는 비워 둔다(listing 은 동결 payload 에만). 그래서 반영 중인 대표이미지가
 * 같은 listing 의 품절 · 등록 실행 자리를 막지 않는다.
 */
export interface ChannelsThumbnailExecutionPort {
  prepare(input: {
    organizationId: string;
    requestedByUserId: string | null;
    salesProductId: string;
    assetId?: string;
    channelListingId?: string;
  }): Promise<ThumbnailExecutionPrepareResponse>;
  report(input: {
    organizationId: string;
    requestedByUserId: string | null;
    executionId: string;
    report: ThumbnailExecutionReportRequest;
  }): Promise<ThumbnailExecutionResult>;
  runOnServer(input: {
    organizationId: string;
    requestedByUserId: string | null;
    salesProductId: string;
    assetId?: string | null;
    owner: { ownerIdempotencyKey: string; requestHash: string } | null;
  }): Promise<ThumbnailExecutionResult>;
  listLatest(input: { organizationId: string; salesProductIds: readonly string[] }): Promise<ThumbnailExecutionStatus[]>;
  dismissFailed(input: { organizationId: string; salesProductId: string }): Promise<{ dismissed: boolean }>;
  /** 운영자가 고를 수 있는 이 판매 상품의 대표이미지 지원 listing. */
  listingChoices(input: { organizationId: string; salesProductId: string }): Promise<ThumbnailExecutionListingChoice[]>;
  resend(input: { organizationId: string; executionId: string }): Promise<ThumbnailExecutionPrepareResponse>;
  confirmApplied(input: {
    organizationId: string;
    requestedByUserId: string | null;
    executionId: string;
  }): Promise<ThumbnailExecutionResult>;
  markNotApplied(input: {
    organizationId: string;
    requestedByUserId: string | null;
    executionId: string;
  }): Promise<ThumbnailExecutionResult>;
}
