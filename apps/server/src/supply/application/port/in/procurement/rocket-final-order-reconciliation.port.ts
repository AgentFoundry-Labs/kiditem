export type RocketFinalOrderReconciliationLine = {
  finalOrderLineId: string;
  poNumber: string;
  productNo: string;
  barcode: string | null;
  unitQuantity: number;
};

/**
 * 활성 발주확정(commitment) 이 없어 정산 대상에서 제외된 최종주문 라인.
 * 배치 전체를 막는 하드 에러 대신 스킵 근거로 호출자에게 보고한다.
 */
export type RocketFinalOrderSkippedLine = {
  poNumber: string;
  productNo: string;
};

export type RocketFinalOrderReconciliationResult = {
  exportId: string | null;
  transmissionIntentKey: string | null;
  matchedLineCount: number;
  reconciledRows: number;
  skippedLines: RocketFinalOrderSkippedLine[];
};

export interface RocketFinalOrderReconciliationPort {
  reconcile(input: {
    transaction: unknown;
    organizationId: string;
    userId: string;
    channelAccountId: string;
    sourceImportRunId: string;
    transport: 'SHIPMENT' | 'MILKRUN';
    lines: RocketFinalOrderReconciliationLine[];
  }): Promise<RocketFinalOrderReconciliationResult>;
}

export const ROCKET_FINAL_ORDER_RECONCILIATION_PORT = Symbol(
  'ROCKET_FINAL_ORDER_RECONCILIATION_PORT',
);
