export const SUPPLY_PURCHASE_ORDER_CAPABILITY_PORT = Symbol(
  'SUPPLY_PURCHASE_ORDER_CAPABILITY_PORT',
);

export interface SupplyPurchaseOrderDraftCapabilityInput {
  organizationId: string;
  userId?: string;
  idempotencyKey: string;
  inputHash: string;
  recommendationArtifactId?: string;
  sellpiaInventorySkuId: string;
  productName: string;
  supplierName: string;
  supplierId?: string;
  unitPriceCny: number;
  moq: number;
  testQuantity?: number;
}

export interface SupplyPurchaseOrderSubmissionCapabilityInput {
  organizationId: string;
  userId: string;
  idempotencyKey: string;
  inputHash: string;
  purchaseOrderId: string;
  externalOrderPlatform?: string | null;
  externalOrderId?: string | null;
  externalOrderUrl?: string | null;
}

export interface SupplyPurchaseOrderCapabilityResult {
  orderId: string;
  status: string;
}

export interface SupplyPurchaseOrderCapabilityPort {
  createPurchaseOrderDraft(
    input: SupplyPurchaseOrderDraftCapabilityInput,
  ): Promise<SupplyPurchaseOrderCapabilityResult>;
  submitPurchaseOrder(
    input: SupplyPurchaseOrderSubmissionCapabilityInput,
  ): Promise<SupplyPurchaseOrderCapabilityResult>;
}
