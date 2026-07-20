export const PURCHASE_ORDER_DRAFT_PORT = Symbol('PURCHASE_ORDER_DRAFT_PORT');

export interface PurchaseOrderDraftRecommendation {
  sellpiaInventorySkuId: string;
  productName: string;
  supplierName: string;
  supplierId?: string | null;
  unitPriceCny: number;
  moq: number;
  testQuantity?: number | null;
}

export interface CreatePurchaseOrderDraftFromRecommendationInput {
  organizationId: string;
  recommendation: PurchaseOrderDraftRecommendation;
}

export interface PurchaseOrderDraftResult {
  orderId: string;
  status: string;
  href: string;
}

export interface PurchaseOrderDraftPort {
  createFromRecommendation(
    input: CreatePurchaseOrderDraftFromRecommendationInput,
  ): Promise<PurchaseOrderDraftResult>;
}
