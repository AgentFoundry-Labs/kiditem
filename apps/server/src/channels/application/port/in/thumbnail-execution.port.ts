import type {
  ThumbnailExecutionPrepareResponse,
  ThumbnailExecutionReportRequest,
  ThumbnailExecutionResult,
  ThumbnailExecutionStatus,
} from '@kiditem/shared/thumbnail-execution';

export const CHANNELS_THUMBNAIL_EXECUTION_PORT = Symbol('CHANNELS_THUMBNAIL_EXECUTION_PORT');

/**
 * 대표이미지 몰 반영의 유일한 소유자. 실행은 `ProductRegistrationExecution`
 * (`executionKind = 'thumbnail_update'`) 한 줄이고 Content 는 사진만 준다.
 *
 * - `prepare` 는 확장 경로다: 실행을 `executing` 으로 만들고 확장에 넘길 사진을 돌려준다.
 *   같은 생성에 살아 있는 실행(`prepared` · `executing` · `reconciling`)이 있으면 409.
 * - `report` 는 확장 결과를 받는다. 끝난 실행에 온 보고는 409, `reconciling` 은 한 번 더 받는다.
 * - `runOnServer` 는 Agent 경로다(개발 서버 전용 Playwright, 운영에서는 503). owner 키가 같으면
 *   같은 실행을 다시 돌려준다.
 * - `listLatest` 는 생성마다 가장 최근 실행이다. 운영자가 치운 실패는 빠진다.
 * - `dismissFailed` 는 가장 최근 실패를 화면에서 치운다(`resultJson.dismissedAt`). 행은 지우지 않는다.
 */
export interface ChannelsThumbnailExecutionPort {
  prepare(input: {
    organizationId: string;
    requestedByUserId: string | null;
    generationId: string;
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
    generationId: string;
    owner: { ownerIdempotencyKey: string; requestHash: string } | null;
  }): Promise<ThumbnailExecutionResult>;
  listLatest(input: { organizationId: string; generationIds: readonly string[] }): Promise<ThumbnailExecutionStatus[]>;
  dismissFailed(input: { organizationId: string; generationId: string }): Promise<{ dismissed: boolean }>;
}
