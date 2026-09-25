import type {
  OperationKind,
  OperationPlanResult,
  OperationStagedChunk,
  OperationWindow,
} from '@kiditem/shared/operation';
import type { OwnerTransaction } from '../../../../../owner-transaction';

export type JsonObject = Record<string, unknown>;

export interface OperationPlanContext {
  organizationId: string;
}

export interface OperationFinalizeContext {
  /** finish 트랜잭션. owner는 자기 persistence 조합에서 이 핸들로 원장을 쓴다. */
  tx: OwnerTransaction;
  organizationId: string;
  operationId: string;
  plan: JsonObject;
}

/**
 * owner가 kind 하나마다 꽂는 포트 둘(ADR-0025). `plan`은 begin에서 무엇을 할지와 잡을 lockKey를,
 * `finalize`는 성공한 finish 트랜잭션 안에서 받은 청크로 원장 사실을 쓴다. 실패·취소에서는 부르지 않는다.
 * 구현 클래스에 `@OperationOwner()`를 붙여 owner 모듈 provider로 두면 부팅 때 등록된다.
 */
export interface OperationOwnerPort {
  readonly kind: OperationKind;
  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult>;
  finalize(
    chunks: OperationStagedChunk[],
    window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result?: JsonObject }>;
}
