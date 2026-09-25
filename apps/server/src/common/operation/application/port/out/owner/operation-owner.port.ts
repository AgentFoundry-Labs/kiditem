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
 * `finalize`는 성공한 finish 트랜잭션 안에서 받은 청크로 원장 사실을 쓴다. 실패·취소에서는 부르지 않고,
 * 재시도가 남지 않은 최종 실패에서만 선택 훅 `onFailed`가 불린다(KID-358).
 * 구현 클래스에 `@OperationOwner()`를 붙여 owner 모듈 provider로 두면 부팅 때 등록된다.
 */
export interface OperationOwnerPort {
  readonly kind: OperationKind;
  /**
   * 이 kind의 임대 길이(ms). 없으면 계약 기본 30분. 서버 워커가 돌리는 짧은 일(AI job 60초)은 짧게 두어
   * 워커가 죽었을 때 다음 claim까지의 공백을 줄인다(KID-358).
   */
  readonly leaseMs?: number;
  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult>;
  finalize(
    chunks: OperationStagedChunk[],
    window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result?: JsonObject }>;
  /**
   * 재시도가 남지 않은 최종 실패(finish failed 또는 임대 만료 판정)에서 같은 트랜잭션 안에 불린다(KID-358).
   * 원장에 "실패했다"를 적어야 하는 kind(AI 생성 기록)만 구현한다. 취소에서는 부르지 않는다.
   */
  onFailed?(context: OperationFailedContext): Promise<void>;
}

export interface OperationFailedContext extends OperationFinalizeContext {
  errorCode: string;
  errorMessage: string | null;
  attempts: number;
}
