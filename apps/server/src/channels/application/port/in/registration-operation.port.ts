import type { OperationPlanResult, OperationStagedChunk, OperationView } from '@kiditem/shared/operation';
import type { RegistrationCloseRequest, RegistrationConfirmRequest } from '@kiditem/shared/channels-operations';
import type { OwnerTransaction } from '../../../../common/owner-transaction';

export const REGISTRATION_OPERATION_PORT = Symbol('REGISTRATION_OPERATION_PORT');
export const MALL_AVAILABILITY_READ_OPERATION_PORT = Symbol('MALL_AVAILABILITY_READ_OPERATION_PORT');

export interface RegistrationFinalizeContext {
  tx: OwnerTransaction;
  organizationId: string;
  operationId: string;
  plan: Record<string, unknown>;
  /** 확장 finish의 `result`, 또는 운영자 확인(`resolve`)이면 멈출 때 result + 확인 내용. */
  result: Record<string, unknown> | null;
}

/**
 * 몰 등록 실행 kind `channels.registration`(KID-364, ADR-0014 · 0019 · 0025). `product_registration_executions`를 대신한다.
 * - `plan`은 옛 준비(대상 · 계정 · 버전 확인, 문서 얼리기)와 옛 시작 확인을 한 번에 한다. 겹침은 잠금 키가 막는다.
 * - `finalize`는 몰이 확정한 등록(확장 finish succeeded 또는 운영자 확인)을 같은 트랜잭션에서 리스팅 · 옵션 · 레시피에 반영한다.
 * - `confirm` · `close`는 `reconciling` 실행을 운영자가 몰에서 본 사실로 닫는다(같은 조직 운영자 누구나, KID-329 (a) 가정).
 */
export interface RegistrationOperationPort {
  plan(scope: Record<string, unknown>, context: { organizationId: string; userId: string | null }): Promise<OperationPlanResult>;
  finalize(chunks: OperationStagedChunk[], context: RegistrationFinalizeContext): Promise<Record<string, unknown>>;
  confirm(organizationId: string, operationId: string, request: RegistrationConfirmRequest): Promise<OperationView>;
  close(organizationId: string, operationId: string, request: RegistrationCloseRequest): Promise<OperationView>;
}

/** 몰 판매 상태 읽기 kind `channels.mall_availability_read`. 원장을 쓰지 않고 `result`에 행만 남긴다. */
export interface MallAvailabilityReadOperationPort {
  plan(scope: Record<string, unknown>, context: { organizationId: string; userId: string | null }): Promise<OperationPlanResult>;
  finalize(chunks: OperationStagedChunk[], context: { organizationId: string; plan: Record<string, unknown> }): Promise<Record<string, unknown>>;
}
