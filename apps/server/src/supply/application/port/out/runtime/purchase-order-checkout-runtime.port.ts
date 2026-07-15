export const PURCHASE_ORDER_CHECKOUT_RUNTIME_PORT = Symbol(
  'PURCHASE_ORDER_CHECKOUT_RUNTIME_PORT',
);

export interface SubmitPurchaseOrderCheckoutInput {
  organizationId: string;
  purchaseOrderId: string;
  idempotencyKey: string;
  purchaseOrder: PurchaseOrderCheckoutSnapshot;
}

export class PurchaseOrderCheckoutProviderFailedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PurchaseOrderCheckoutProviderFailedError';
  }
}

export class PurchaseOrderCheckoutProviderUnknownError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PurchaseOrderCheckoutProviderUnknownError';
  }
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
