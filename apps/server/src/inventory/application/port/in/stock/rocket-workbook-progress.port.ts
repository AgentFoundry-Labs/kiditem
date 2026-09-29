import type { SellpiaTransferSourceRef } from '../../../../../orders/application/port/in/capability/sellpia-transfer-outcome.port';

/**
 * Server-side state of one exported Rocket workbook workflow. Supply reads it
 * to fence a new export and abandonment; no client receives it.
 */
export type RocketWorkbookWorkflowStatus =
  | 'awaiting_coupang_confirmation'
  | 'orders_collected'
  | 'sellpia_transmitting'
  | 'completed';

export interface RocketWorkbookProgressPort {
  read(input: {
    transaction: unknown;
    organizationId: string;
    exportGeneration: bigint | null;
    allPositiveLinesCollected: boolean;
    /**
     * 워크북을 관측한 직배송 실행이 낸 파일(비어 있지 않은 관측)마다 `{직배송 실행 id, 운송유형}` — 셀피아 전송
     * 실행 `orders.sellpia_order_transfer`의 원천(KID-388).
     */
    transmissionSources: readonly SellpiaTransferSourceRef[];
  }): Promise<{
    status: RocketWorkbookWorkflowStatus;
    verifiedGeneration: bigint;
  }>;
}

export const ROCKET_WORKBOOK_PROGRESS_PORT = Symbol(
  'ROCKET_WORKBOOK_PROGRESS_PORT',
);
