export type RocketFinalOrderReconciliationLine = {
  finalOrderLineId: string;
  poNumber: string;
  productNo: string;
  barcode: string | null;
  unitQuantity: number;
};

export interface RocketFinalOrderReconciliationPort {
  reconcile(input: {
    transaction: unknown;
    organizationId: string;
    userId: string;
    channelAccountId: string;
    lines: RocketFinalOrderReconciliationLine[];
  }): Promise<{ reconciledRows: number }>;
}

export const ROCKET_FINAL_ORDER_RECONCILIATION_PORT = Symbol(
  'ROCKET_FINAL_ORDER_RECONCILIATION_PORT',
);
