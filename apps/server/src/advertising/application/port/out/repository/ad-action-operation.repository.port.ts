import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { AdActionExecutionRecord, AdActionForExecution } from '../../../../domain/ad-action-operation';

export const AD_ACTION_OPERATION_REPOSITORY_PORT = Symbol('AdActionOperationRepositoryPort');

/** 광고 액션 실행 kind(KID-386)의 읽기·감사 기록 쓰기. 쓰기는 finish(또는 최종 실패) 트랜잭션 안에서만. */
export interface AdActionOperationRepositoryPort {
  /** 조직의 액션 한 건(없으면 null). `transaction`이 없으면 자기 읽기로 본다(plan). */
  readAction(organizationId: string, actionId: string, transaction?: OwnerTransaction): Promise<AdActionForExecution | null>;
  /** 활성 쿠팡 계정과 그 업체코드. 계정이 꺼졌거나 없으면 null. */
  readAccount(
    organizationId: string,
    channelAccountId: string,
    transaction?: OwnerTransaction,
  ): Promise<{ id: string; vendorId: string | null } | null>;
  /**
   * 이 실행이 닫힐 때 남은 `result`(없으면 null). 실패 finish의 `result`는 owner `onFailed` 문맥에 실리지 않으므로
   * 같은 트랜잭션에서 실행 행을 읽는다.
   */
  readRunResult(
    transaction: OwnerTransaction,
    input: { organizationId: string; actionId: string; operationId: string },
  ): Promise<Record<string, unknown> | null>;
  /** 액션 `payload.execution`을 이 기록으로 바꾼다(다른 payload 칸은 그대로). */
  recordExecution(
    transaction: OwnerTransaction,
    input: { organizationId: string; actionId: string; execution: AdActionExecutionRecord },
  ): Promise<void>;
}
