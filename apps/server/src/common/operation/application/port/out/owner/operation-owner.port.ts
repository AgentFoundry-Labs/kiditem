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
  /** 실행을 시작한 사용자. 세션이 없는 서버 구동 prepare는 null. owner가 원장에 사람을 적어야 하면 plan JSON에 보관한다(KID-354). */
  userId: string | null;
}

export interface OperationFinalizeContext {
  /** finish 트랜잭션. owner는 자기 persistence 조합에서 이 핸들로 원장을 쓴다. */
  tx: OwnerTransaction;
  organizationId: string;
  operationId: string;
  plan: JsonObject;
  /**
   * `reconciling`으로 멈췄던 실행을 owner가 확인(`resolve` succeeded)할 때만: 멈출 때 저장한 `result`에 확인 요청의
   * `result`를 덮은 값(KID-364). 확장 finish에서 온 finalize에는 finish 요청의 `result`(없으면 null)다.
   */
  result?: JsonObject | null;
  /** 이번 시도가 몇 번째 claim인가(begin으로 연 실행은 1)와 상한(KID-358). */
  attempts: number;
  maxAttempts: number;
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
  /**
   * finish `reconciling`(외부에 제출했지만 결과를 못 읽음)을 받는 kind만 true(KID-364, 몰 등록). 없으면 계약이 그 finish 를
   * `VALIDATION_FAILED` 로 거절한다 — 확인 경로(`resolve`)가 없는 kind 가 잠금을 영구히 쥐지 않게.
   */
  readonly reconciles?: true;
  /**
   * 서버만 여는 kind(KID-389): 요청 안에서 서버가 begin·putChunk·finish하거나(서버 구동 소싱) 워커가 prepare·claim한다
   * (AI 생성 job). true면 HTTP 문(`POST /api/operations`·`/claim`)이 그 kind를 `VALIDATION_FAILED`(`server_driven_kind`)로
   * 거절한다 — 브라우저가 서버 kind를 열거나 집어 조작한 청크로 원장을 쓰지 못하게. 없으면 확장이 begin하는 kind다.
   */
  readonly serverDriven?: true;
  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult>;
  /**
   * `window`를 돌려주면 실행에 남는 확정 창을 그것으로 좁힌다(광고 보고서 kind의 전날 보류, KID-371).
   * 넓히지는 못한다 — 계약이 요청 창 밖으로 나가는 값을 거절한다.
   */
  finalize(
    chunks: OperationStagedChunk[],
    window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result?: JsonObject; window?: OperationWindow }>;
  /**
   * 재시도가 남지 않은 최종 실패(finish failed 또는 임대 만료 판정)에서 같은 트랜잭션 안에 불린다(KID-358).
   * 원장에 "실패했다"를 적어야 하는 kind(AI 생성 기록)만 구현한다. 취소에서는 부르지 않는다.
   */
  onFailed?(context: OperationFailedContext): Promise<void>;
}

export interface OperationFailedContext extends OperationFinalizeContext {
  errorCode: string;
  errorMessage: string | null;
}
