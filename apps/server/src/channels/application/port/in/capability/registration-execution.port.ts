import type { PrepareListingAvailabilityInput, ListingAvailabilityExecution, ReportListingAvailabilityInput } from '@kiditem/shared/sales-product';
import type { PrepareTargetExecutionInput, ReportTargetExecutionInput, TargetExecutionResult } from '@kiditem/shared/sales-product';

export const REGISTRATION_EXECUTION_PORT = Symbol('REGISTRATION_EXECUTION_PORT');

/**
 * 등록 실행 울타리. 판매상품 하나를 채널 계정 하나에 최대 한 번만 제출한다.
 *
 * 울타리의 정체성은 `{organizationId, salesProductId, channelAccountId}` 다 — 수집에서
 * 온 상품이든 직접 작성한 상품이든 같은 문을 지난다
 * ([ADR-0022](../../../../../../../../docs/adr/0022-sales-product-draft-exists-from-collection.md)).
 * 원천 기록(`sourceRecordId`)은 이력에만 남는 출처 표시이지 열쇠가 아니다.
 *
 * 폼 몰(확장) · 스프레드시트 · API 몰 — 계정에 제출하는 모든 경로가 이 한 인터페이스를
 * 지난다([ADR-0014](../../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 * 몰마다 다른 전달 방식과 확인 증거는 채널 어댑터가 맡는다(KID-321).
 * 제출 없이 폼만 채운 것은 울타리가 아니라 관찰 기록이다.
 */
export interface RegistrationExecutionPort {
  prepareListingAvailability(organizationId: string, userId: string | null, input: PrepareListingAvailabilityInput): Promise<ListingAvailabilityExecution>;
  listListingAvailability(organizationId: string, userId: string | null, channelAccountId: string, externalListingId: string): Promise<ListingAvailabilityExecution[]>;
  startListingAvailability(organizationId: string, userId: string | null, executionId: string): Promise<ListingAvailabilityExecution>;
  reportListingAvailability(organizationId: string, userId: string | null, executionId: string, input: ReportListingAvailabilityInput): Promise<ListingAvailabilityExecution>;

  prepareTargetExecution(organizationId: string, targetId: string, userId: string | null, input: PrepareTargetExecutionInput): Promise<TargetExecutionResult>;
  startTargetExecution(organizationId: string, executionId: string, userId: string | null): Promise<TargetExecutionResult>;
  listTargetExecutions(organizationId: string, targetId: string, userId: string | null): Promise<TargetExecutionResult[]>;
  getTargetExecution(organizationId: string, executionId: string, userId: string | null): Promise<TargetExecutionResult>;
  reportTargetExecution(organizationId: string, executionId: string, userId: string | null, input: ReportTargetExecutionInput): Promise<TargetExecutionResult>;
}
