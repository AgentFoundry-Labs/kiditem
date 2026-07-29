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
  matchedLineCount: number;
  reconciledRows: number;
  unmatchedLines: RocketFinalOrderUnmatchedLine[];
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
