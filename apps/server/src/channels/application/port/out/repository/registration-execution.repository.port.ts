import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { ListingAvailabilitySnapshot } from '@kiditem/shared/sales-product';
import type { PrepareListingAvailabilityInput, ListingAvailabilityExecution, ReportListingAvailabilityInput } from '@kiditem/shared/sales-product';
import type { PrepareTargetExecutionInput, ReportTargetExecutionInput, TargetExecutionResult, TargetExecutionSnapshot } from '@kiditem/shared/sales-product';

/**
 * 애플리케이션이 모은 실행 의도 — 동결 스냅샷에서 채널 어댑터가 준비 트랜잭션 안에서 채우는
 * `adapterPayload` 만 빠진다(KID-321). `representativeImage` 는 등록 · 구성 전환이 몰에 보낼 대표이미지 자산이고
 * (KID-313 W3a), 울타리가 `adapterPayload.representativeImage` 로 얼린다 — 몰 어댑터가 그 사진을 대표이미지로 쓴다.
 */
export type TargetExecutionIntent = Omit<TargetExecutionSnapshot, 'adapterPayload'> & {
  representativeImage?: { assetId: string; url: string } | null;
};

export const REGISTRATION_EXECUTION_REPOSITORY_PORT = Symbol(
  'REGISTRATION_EXECUTION_REPOSITORY_PORT',
);

export interface RegistrationExecutionRepositoryPort {
  findListingAvailabilityByKey(input: { organizationId: string; requestedByUserId: string | null; idempotencyKey: string }): Promise<ListingAvailabilityExecution | null>;
  prepareListingAvailability(input: { organizationId: string; requestedByUserId: string | null; request: PrepareListingAvailabilityInput }): Promise<ListingAvailabilityExecution>;
  listListingAvailability(input: { organizationId: string; requestedByUserId: string | null; channelAccountId: string; externalListingId: string }): Promise<ListingAvailabilityExecution[]>;
  startListingAvailability(input: { organizationId: string; requestedByUserId: string | null; executionId: string; assertInventoryStockout?: (transaction: OwnerTransaction, snapshot: ListingAvailabilitySnapshot) => Promise<void> }): Promise<ListingAvailabilityExecution>;
  reportListingAvailability(input: { organizationId: string; requestedByUserId: string | null; executionId: string; report: ReportListingAvailabilityInput }): Promise<ListingAvailabilityExecution>;

  findTargetReplay(input: { organizationId: string; requestedByUserId: string | null; targetId: string; request: PrepareTargetExecutionInput }): Promise<TargetExecutionResult | null>;
  /** Persist this server-resolved snapshot only if target and common product versions still match. */
  prepareTarget(input: {
    organizationId: string; requestedByUserId: string | null; request: PrepareTargetExecutionInput;
    snapshot: TargetExecutionIntent;
  }): Promise<TargetExecutionResult>;
  startTarget(input: { organizationId: string; executionId: string; requestedByUserId: string | null }): Promise<TargetExecutionResult>;
  listTarget(input: { organizationId: string; targetId: string; requestedByUserId: string | null }): Promise<TargetExecutionResult[]>;
  getTarget(input: { organizationId: string; executionId: string; requestedByUserId: string | null }): Promise<TargetExecutionResult>;
  reportTarget(input: { organizationId: string; executionId: string; requestedByUserId: string | null; report: ReportTargetExecutionInput }): Promise<TargetExecutionResult>;
}
