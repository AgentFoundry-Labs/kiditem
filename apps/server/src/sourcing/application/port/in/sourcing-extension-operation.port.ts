import type { SourcingExtensionKind, SourcingOperationResult } from '@kiditem/shared/sourcing-operation';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import type { OwnerTransaction } from '../../../../common/owner-transaction';

export const SOURCING_EXTENSION_OPERATION_PORT = Symbol('SOURCING_EXTENSION_OPERATION_PORT');

export interface SourcingOperationPlanContext {
  organizationId: string;
  userId: string | null;
}

export interface SourcingOperationFinalizeContext {
  tx: OwnerTransaction;
  organizationId: string;
  operationId: string;
  plan: Record<string, unknown>;
}

/**
 * 확장 구동 소싱 kind 6종(KID-360)의 owner 일. `plan`은 scope 검증·원천 키·잠금 키·plan JSON을,
 * `finalize`는 finish 트랜잭션 안에서 청크를 옛 attempt 출력으로 조립해 원장·발행을 쓰고 result를 돌려준다
 * (범위를 다 채우지 못했으면 던진다 → 실행 failed, 원장 0). `failed`는 재시도 없는 최종 실패에 원천 실패
 * 알림을 남긴다.
 */
export interface SourcingExtensionOperationPort {
  plan(kind: SourcingExtensionKind, scope: Record<string, unknown>, context: SourcingOperationPlanContext): Promise<OperationPlanResult>;
  finalize(kind: SourcingExtensionKind, chunks: OperationStagedChunk[], context: SourcingOperationFinalizeContext): Promise<SourcingOperationResult>;
  failed(kind: SourcingExtensionKind, context: SourcingOperationFinalizeContext & { errorCode: string; errorMessage: string | null }): Promise<void>;
}
