export const PURCHASE_ORDER_CHECKOUT_RUNTIME_PORT = Symbol(
  'PURCHASE_ORDER_CHECKOUT_RUNTIME_PORT',
);

export interface SubmitPurchaseOrderCheckoutInput {
  organizationId: string;
  purchaseOrderId: string;
  purchaseOrder: PurchaseOrderCheckoutSnapshot;
}

export interface SubmitPurchaseOrderCheckoutResult {
  externalOrderPlatform: string;
  externalOrderId: string;
  externalOrderUrl: string | null;
}

export interface PurchaseOrderCheckoutSnapshotItem {
  productName: string;
  masterProductId: string;
  quantity: number;
  unitPriceCny: string;
}

export interface PurchaseOrderCheckoutSnapshot {
  id: string;
  supplierName: string;
  supplierId: string | null;
  totalAmountCny: string;
  items: PurchaseOrderCheckoutSnapshotItem[];
}

export interface PurchaseOrderCheckoutRuntimePort {
  submit(
    input: SubmitPurchaseOrderCheckoutInput,
  ): Promise<SubmitPurchaseOrderCheckoutResult>;
}
