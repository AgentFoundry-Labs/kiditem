import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import type { SourcingServerKind, SourcingServerOperationResult } from '@kiditem/shared/sourcing-operation';
import type { SourcingOperationFinalizeContext, SourcingOperationPlanContext } from './sourcing-extension-operation.port';

export const SOURCING_SERVER_OPERATION_PORT = Symbol('SOURCING_SERVER_OPERATION_PORT');

export interface SourcingServerFailedContext extends SourcingOperationFinalizeContext {
  errorCode: string;
  errorMessage: string | null;
}

/**
 * 서버 구동 소싱 kind 8개(KID-389)의 owner 일. `plan`은 서버가 얼린 scope를 검증하고 원천이 켜졌는지 보고 원천·대상
 * 잠금을 잡는다. `finalize`는 finish 트랜잭션 안에서 `source_output` 청크를 옛 attempt 종료처럼 원장·(URL 수집이면
 * 원본 기록과 초안)·발행으로 쓰고 원천 실패 알림을 닫는다. 최종 실패(`onFailed`)는 그 알림을 연다.
 */
export interface SourcingServerOperationPort {
  plan(kind: SourcingServerKind, scope: Record<string, unknown>, context: SourcingOperationPlanContext): Promise<OperationPlanResult>;
  finalize(kind: SourcingServerKind, chunks: OperationStagedChunk[], context: SourcingOperationFinalizeContext): Promise<SourcingServerOperationResult>;
  onFailed(kind: SourcingServerKind, context: SourcingServerFailedContext): Promise<void>;
}
