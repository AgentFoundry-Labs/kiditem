import type { ChannelsRepositoryTransaction } from '../../out/transaction/repository-transaction';
import type {
  ClosedRegistrationExecutionResult,
  RegistrationExecutionResult,
} from '../../out/repository/registration-execution.repository.port';
import type {
  ExternalProductRegistrationMatchPreviewResult,
  ExternalProductRegistrationPreflightResult,
} from './marketplace-registration.port';

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
 * 등록 실행 울타리. 채널 계정 하나에 초안 하나를 최대 한 번만 제출한다.
 *
 * Wing autoSubmit, 스프레드시트, API 몰 — 계정에 제출하는 모든 경로가 이 한 인터페이스를
 * 지난다([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 * 제출 없이 폼만 채운 것은 울타리가 아니라 관찰 기록이다.
 */
export interface RegistrationExecutionPort {
  /**
   * 후보 삭제 준비. 제출 흔적이 없는 실행만 취소한다. 호출자의 트랜잭션에서
   * 실행되어 후보 종료와 같은 커밋에 들어간다.
   */
  cancelUnstartedExecutions(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; sourceCandidateId: string; cancelledAt: Date },
  ): Promise<number>;

  prepareWingRegistration(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    input: PrepareWingRegistrationInput,
  ): Promise<PreparedWingRegistration>;

  previewWingRegistrationMatch(
    organizationId: string,
    candidateId: string,
    input: { listingName: string; itemName?: string },
  ): Promise<ExternalProductRegistrationMatchPreviewResult>;

  startExecution(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    executionId: string,
  ): Promise<RegistrationExecutionResult>;

  getExecution(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    executionId: string,
  ): Promise<RegistrationExecutionResult>;

  markExecutionUnresolved(
    organizationId: string,
    candidateId: string,
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
    candidateId: string,
    userId: string | null,
    executionId: string,
    evidence: unknown,
  ): Promise<ClosedRegistrationExecutionResult>;

  confirmExecution(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    input: ConfirmRegistrationExecutionInput,
  ): Promise<{ preparationId: string; status: 'registered' | 'failed'; listingId?: string }>;
}
