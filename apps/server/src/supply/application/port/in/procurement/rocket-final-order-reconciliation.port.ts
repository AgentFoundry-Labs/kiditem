export type RocketFinalOrderReconciliationLine = {
  finalOrderLineId: string;
  poNumber: string;
  productNo: string;
  barcode: string | null;
  unitQuantity: number;
};

/** 활성 워크북에는 연결되지 않았지만 Sellpia 후보에는 남는 최종주문 라인. */
export type RocketFinalOrderUnmatchedLine = {
  poNumber: string;
  productNo: string;
};

export type RocketFinalOrderReconciliationResult = {
  exportId: string | null;
  transmissionIntentKey: string | null;
  reconciledRows: number;
  unmatchedLines: RocketFinalOrderUnmatchedLine[];
};

export interface RocketFinalOrderReconciliationPort {
  reconcile(input: {
    transaction: unknown;
    organizationId: string;
    userId: string;
    channelAccountId: string;
    /** 최종주문을 관측한 Orders 직배송 실행(`orders.coupang_directship`, KID-359). 전송 키가 이 ID로 고정된다. */
    directshipOperationId: string;
    transport: 'SHIPMENT' | 'MILKRUN';
    lines: RocketFinalOrderReconciliationLine[];
  }): Promise<RocketFinalOrderReconciliationResult>;
}

export const ROCKET_FINAL_ORDER_RECONCILIATION_PORT = Symbol(
  'ROCKET_FINAL_ORDER_RECONCILIATION_PORT',
);
