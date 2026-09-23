import type { PrepareListingAvailabilityInput, ListingAvailabilityExecution, ReportListingAvailabilityInput } from '@kiditem/shared/sales-product';
import type { PrepareTargetExecutionInput, ReportTargetExecutionInput, TargetExecutionResult } from '@kiditem/shared/sales-product';
import type { ChannelsRepositoryTransaction } from '../../out/transaction/repository-transaction';
import type {
  ClosedRegistrationExecutionResult,
  RegistrationExecutionResult,
} from '../../out/repository/registration-execution.repository.port';
import type {
  ExternalProductRegistrationMatchPreviewResult,
  ExternalProductRegistrationPreflightResult,
} from '../registration/channel-registration.port';

export const REGISTRATION_EXECUTION_PORT = Symbol('REGISTRATION_EXECUTION_PORT');

export interface PrepareWingRegistrationInput {
  channelAccountId: string;
  displayName: string;
  registrationInput: Record<string, unknown>;
  idempotencyKey: string;
  sellpiaInventorySkuId?: string;
  sellpiaQuantity?: number;
}

export type PreparedWingRegistration =
  RegistrationExecutionResult
  & ExternalProductRegistrationPreflightResult
  & { expectedVendorId: string };

export interface ConfirmRegistrationExecutionInput {
  executionId: string;
  externalListingId: string;
  evidence?: { wingVendorId: string; wingIdentitySource: string };
}

/**
 * 등록 실행 울타리. 판매상품 하나를 채널 계정 하나에 최대 한 번만 제출한다.
 *
 * 울타리의 정체성은 `{organizationId, salesProductId, channelAccountId}` 다 — 수집에서
 * 온 상품이든 직접 작성한 상품이든 같은 문을 지난다
 * ([ADR-0022](../../../../../../../../docs/adr/0022-sales-product-draft-exists-from-collection.md)).
 * 원천 기록(`sourceRecordId`)은 이력에만 남는 출처 표시이지 열쇠가 아니다.
 *
 * Wing autoSubmit, 스프레드시트, API 몰 — 계정에 제출하는 모든 경로가 이 한 인터페이스를
 * 지난다([ADR-0014](../../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
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

  prepareWingRegistration(
    organizationId: string,
    salesProductId: string,
    userId: string | null,
    input: PrepareWingRegistrationInput,
  ): Promise<PreparedWingRegistration>;

  previewWingRegistrationMatch(
    organizationId: string,
    salesProductId: string,
    input: { listingName: string; itemName?: string },
  ): Promise<ExternalProductRegistrationMatchPreviewResult>;

  startExecution(
    organizationId: string,
    salesProductId: string,
    userId: string | null,
    executionId: string,
  ): Promise<RegistrationExecutionResult>;

  getExecution(
    organizationId: string,
    salesProductId: string,
    userId: string | null,
    executionId: string,
  ): Promise<RegistrationExecutionResult>;

  markExecutionUnresolved(
    organizationId: string,
    salesProductId: string,
    userId: string | null,
    executionId: string,
    evidence: unknown,
  ): Promise<RegistrationExecutionResult>;

  /**
   * 확장이 폼을 채우다 실패해 마켓에 아무것도 제출되지 않은 경우.
   *
   * 제출 여부를 모르는 실패(`markExecutionUnresolved`)와 달리 중복 등록 위험이
   * 없어 확정 실패로 닫고 재시도를 연다. 기록된 공급자 식별자가 있으면 저장소가
   * 거부하므로 성공한 등록은 이 경로로 뒤집을 수 없다.
   */
  markExecutionNotSubmitted(
    organizationId: string,
    salesProductId: string,
    userId: string | null,
    executionId: string,
    evidence: unknown,
  ): Promise<ClosedRegistrationExecutionResult>;

  confirmExecution(
    organizationId: string,
    salesProductId: string,
    userId: string | null,
    input: ConfirmRegistrationExecutionInput,
  ): Promise<{ preparationId: string; status: 'registered' | 'failed'; listingId?: string }>;
}
