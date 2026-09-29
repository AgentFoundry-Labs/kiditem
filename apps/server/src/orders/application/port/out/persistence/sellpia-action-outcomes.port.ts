import type { OwnerTransaction } from '../../../../../common/owner-transaction';

export const SELLPIA_ACTION_OUTCOMES_PORT = Symbol('SELLPIA_ACTION_OUTCOMES_PORT');

/** 성공한 셀피아 작업 실행의 result 한 벌(자동송장 대상 규칙의 입력). result 모양은 domain이 읽는다. */
export interface SellpiaActionOutcome {
  result: unknown;
  finishedAt: Date;
}

/**
 * 셀피아 전송·자동송장 실행의 성공 result(KID-355 wave8b). 자동송장 대상은 표 없이 이 result들로 정한다(사장님 Q3).
 * `transaction`을 주면 그 트랜잭션(finish)에서, null이면 새 읽기로 본다.
 */
export interface SellpiaActionOutcomesPort {
  readSince(transaction: OwnerTransaction | null, input: { organizationId: string; since: Date }): Promise<{
    transfers: SellpiaActionOutcome[];
    invoices: SellpiaActionOutcome[];
  }>;
  /** 같은 원천 실행(+운송유형, 몰 주문은 null)을 보낸 가장 최근 성공 전송 실행 id. 없으면 null(재전송 울타리). */
  findSucceededTransfer(input: { organizationId: string; sourceOperationId: string; transport: string | null }): Promise<string | null>;
}
