import type { OperationStatus, ProviderOutcome } from '@kiditem/shared/registration-execution';
import type { ThumbnailReportTransition, ThumbnailUpdatePayload } from '../../../../domain/registration/thumbnail-update';

export const THUMBNAIL_EXECUTION_PERSISTENCE_PORT = Symbol('THUMBNAIL_EXECUTION_PERSISTENCE_PORT');

export type ThumbnailExecutionRow = Readonly<{
  id: string;
  generationId: string;
  status: OperationStatus;
  providerOutcome: ProviderOutcome;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  screenshotPath: string | null;
  completedAt: Date | null;
  updatedAt: Date;
}>;

/**
 * `ProductRegistrationExecution` 중 `executionKind = 'thumbnail_update'` 행만 쓴다. 생성 id 는
 * 동결 payload(`submissionPayloadJson.generationId`)에만 있다. 같은 생성의 살아 있는 실행 검사는
 * 생성 id 로 잡은 advisory lock 안에서 한다.
 */
export interface ThumbnailExecutionPersistencePort {
  /**
   * 조직의 활성 쿠팡 계정과 반영할 listing. 운영자가 고른 listing 은 이 조직의 살아 있는 쿠팡
   * listing 이면서 이 판매상품의 것이거나 작업공간 자신의 listing 이어야 한다(아니면 입력 오류).
   * 고르지 않았으면 작업공간 listing(살아 있지 않으면 없음 오류), 없으면 판매상품의 쿠팡 listing 이다.
   */
  readAccountEvidence(input: {
    organizationId: string;
    pickedListingId: string | null;
    workspaceListingId: string | null;
    salesProductId: string | null;
  }): Promise<{
    listingAccountId: string | null;
    channelListingId: string | null;
    /** 반영할 listing 의 몰 상품명. 몰 관리자에서 상품을 찾는 이름이다. */
    listingChannelName: string | null;
    /** 반영할 listing 의 몰 상품 id. 없으면 null. */
    listingExternalId: string | null;
    /**
     * 고르지 않았고 작업공간 listing 도 없을 때 판매상품의 살아 있는 listing 수(2 는 "여럿"). 대표이미지
     * 반영을 지원하는 채널(registry `representativeImage`)의 listing 만 센다.
     */
    productListingCount: number;
    /** 대표이미지 반영을 지원하는 채널의 활성 계정 id 들. */
    activeAccountIds: string[];
    /** 위 listing 계정과 활성 계정들의 채널 키. 실행이 그 채널 어댑터의 runner 를 고른다. */
    channelByAccountId: Record<string, string>;
  }>;
  /** 새 실행을 `executing` 으로 만든다. owner 키가 이미 있으면 그 실행을 `replay` 로 돌려준다. */
  createExecuting(input: {
    organizationId: string;
    requestedByUserId: string | null;
    channelAccountId: string;
    idempotencyKey: string;
    ownerIdempotencyKey: string | null;
    requestHash: string;
    payload: ThumbnailUpdatePayload;
    payloadHash: string;
  }): Promise<
    | { mode: 'created'; executionId: string }
    | { mode: 'replay'; execution: ThumbnailExecutionRow }
    | { mode: 'live_conflict' }
    /** 동결 payload 의 listing 에 다른 생성의 살아 있는 반영이 있다(listing 도 생성과 같이 lock 한다). */
    | { mode: 'listing_conflict' }
  >;
  /**
   * 보고를 반영한다. `acceptFrom` 에 없는 상태면 `rejected`. 사진 경로 · 외부 id 는 주어질 때만
   * 덮어쓴다(운영자 확인이 올릴 때의 스크린샷을 지우지 않게).
   */
  applyReport(input: {
    organizationId: string;
    executionId: string;
    transition: ThumbnailReportTransition;
    acceptFrom: readonly OperationStatus[];
    screenshotPath: string | null;
    externalId: string | null;
  }): Promise<{ mode: 'applied'; execution: ThumbnailExecutionRow } | { mode: 'rejected'; status: OperationStatus } | { mode: 'not_found' }>;
  /** 판매상품(없으면 작업공간 listing)의 살아 있는 쿠팡 listing. 운영자가 고를 목록이다. */
  findListingChoices(input: {
    organizationId: string;
    salesProductId: string | null;
    workspaceListingId: string | null;
  }): Promise<Array<{ id: string; channelName: string | null; channelAccountName: string; externalId: string }>>;
  /**
   * owner 키로 이미 만든 실행. 없으면 null, 같은 키가 다른 생성 · 요청 해시로 쓰였으면 충돌을 던진다.
   * 재생은 Content 읽기 · 계정 결정 · 사진 읽기 · 운영 차단보다 먼저 답한다.
   */
  findOwnerReplay(input: {
    organizationId: string;
    idempotencyKey: string;
    ownerIdempotencyKey: string;
    requestHash: string;
    generationId: string;
  }): Promise<ThumbnailExecutionRow | null>;
  /** 살아 있는 실행의 동결 payload. 끝난 실행은 그 상태를, 없으면 `not_found`. */
  readLivePayload(input: { organizationId: string; executionId: string }): Promise<
    | { mode: 'live'; payload: ThumbnailUpdatePayload }
    | { mode: 'finished'; status: OperationStatus }
    | { mode: 'not_found' }
  >;
  findLatest(input: { organizationId: string; generationIds: readonly string[] }): Promise<ThumbnailExecutionRow[]>;
  dismissLatestFailed(input: { organizationId: string; generationId: string }): Promise<boolean>;
}
