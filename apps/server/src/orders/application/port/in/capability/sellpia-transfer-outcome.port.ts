import type { Prisma } from '@prisma/client';
import type { SellpiaTransferTransport } from '@kiditem/shared/orders-action-operations';

export const SELLPIA_TRANSFER_OUTCOME_PORT = Symbol('SELLPIA_TRANSFER_OUTCOME_PORT');

/**
 * 셀피아 전송 결과 capability(KID-388, ADR-0021·0025). 다른 owner(Inventory 로켓 워크북 진행, Supply 발주확정 완료)가
 * "이 원천 파일이 셀피아로 갔는가"를 물을 때 쓰는 Orders 공개 인터페이스 — 옛 `sellpia_order_transmission_intents` 표를
 * 직접 읽던 자리를 대신한다(wave8b 뒤 intent를 만드는 곳이 0이라 워크북이 `orders_collected`에 멈추던 회귀).
 *
 * 원천은 전송 실행 `orders.sellpia_order_transfer`의 plan `{sourceOperationId, transport}`로 찾는다(옛 intent 키
 * `rocket-final-order:<directshipOperationId>:<transport>`와 1:1). 같은 원천에 실행이 여럿이면 성공한 실행이 하나라도
 * 있을 때 가장 최근 성공(셀피아로 간 파일은 재전송 실패로 되돌아가지 않는다), 없으면 가장 최근 실행 하나.
 * 상태 → 워크북 진행(리더 결정 2026-09-29): `succeeded` → completed, `in_progress`·`reconciling` → sellpia_transmitting,
 * `none`·`failed` → orders_collected(재전송 가능; 옛 aborted→failed 판정은 없앤다).
 * 구현은 `common/operation/transaction/operations-by-plan.ts`(`readOperationsByPlan`)로만 읽는다 — owner 어댑터가
 * `operations`를 직접 JOIN하지 않는다(`check:operation-owner-boundary`).
 */
export type SellpiaTransferOutcomeStatus = 'none' | 'in_progress' | 'reconciling' | 'succeeded' | 'failed';

export interface SellpiaTransferSourceRef {
  sourceOperationId: string;
  transport: SellpiaTransferTransport | null;
}

export interface SellpiaTransferOutcome {
  source: SellpiaTransferSourceRef;
  status: SellpiaTransferOutcomeStatus;
  /** 답한 전송 실행 id — 가장 최근 성공, 없으면 가장 최근 실행(없으면 null). */
  operationId: string | null;
  finishedAt: Date | null;
}

export interface SellpiaTransferOutcomePort {
  /** 원천마다 결과 하나씩, 입력 순서대로. 실행이 없으면 `none`. 호출자의 트랜잭션 안에서 읽을 수 있다. */
  readLatestOutcomes(input: {
    organizationId: string;
    sources: readonly SellpiaTransferSourceRef[];
    transaction?: Prisma.TransactionClient;
  }): Promise<SellpiaTransferOutcome[]>;
}
