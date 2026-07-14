export const PROCUREMENT_REPOSITORY_PORT = Symbol('PROCUREMENT_REPOSITORY_PORT');

export type PurchaseOrderStatusCounts = {
  all: number;
  draft: number;
  pending: number;
  ordered: number;
  shipped: number;
  received: number;
  cancelled: number;
};

export type PurchaseOrderSummary = {
  orderCount: number;
  totalQuantity: number;
  totalAmountCny: number;
};

export type PurchaseOrderListQuery = {
  page?: number;
  limit?: number;
  status?: string;
  supplier?: string;
  supplierId?: string;
};

export type PurchaseOrderItemCommand = {
  productName: string;
  productId?: string;
  masterProductId: string;
  quantity: number;
  unitPriceCny: number;
};

export type PurchaseOrderCreateCommand = {
  supplierName: string;
  supplierId?: string;
  items: PurchaseOrderItemCommand[];
  expectedDeliveryDate?: string;
};

export type PurchaseOrderRecord = {
  id: string;
  organizationId: string;
  supplierName: string;
  supplierContact: string | null;
  supplierId: string | null;
  totalAmountCny: unknown;
  status: string;
  orderDate: Date;
  expectedDeliveryDate: Date | null;
  trackingNumber: string | null;
  externalOrderPlatform: string | null;
  externalOrderId: string | null;
  externalOrderUrl: string | null;
  receivedAt: Date | null;
  receivedQty: number | null;
  defectQty: number | null;
  defectType: string | null;
  defectAction: string | null;
  defectNote: string | null;
  inspectedAt: Date | null;
  inspectedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PurchaseOrderCheckoutSnapshotItem = {
  productName: string;
  masterProductId: string;
  quantity: number;
  unitPriceCny: string;
};

export type PurchaseOrderCheckoutSnapshot = {
  id: string;
  supplierName: string;
  supplierId: string | null;
  totalAmountCny: string;
  items: PurchaseOrderCheckoutSnapshotItem[];
};

export type PurchaseOrderListResult = {
  items: unknown[];
  total: number;
  page: number;
  limit: number;
  counts: PurchaseOrderStatusCounts;
  summary: PurchaseOrderSummary;
};

export type CreateDraftPurchaseOrderResult =
  | { ok: true; order: unknown }
  | { ok: false; reason: 'supplier_not_found' }
  | { ok: false; reason: 'master_product_not_found'; missingMasterProductIds: string[] };

export type PurchaseOrderStatusUpdate = {
  status: string;
  receivedAt?: Date;
  externalOrderPlatform?: string | null;
  externalOrderId?: string | null;
  externalOrderUrl?: string | null;
};

export interface ProcurementRepositoryPort {
  list(organizationId: string, query: PurchaseOrderListQuery): Promise<PurchaseOrderListResult>;
  createDraft(
    organizationId: string,
    command: PurchaseOrderCreateCommand,
  ): Promise<CreateDraftPurchaseOrderResult>;
  findScopedStatus(
    organizationId: string,
    id: string,
  ): Promise<{ id: string; status: string } | null>;
  findCheckoutSnapshot(
    organizationId: string,
    id: string,
  ): Promise<PurchaseOrderCheckoutSnapshot | null>;
  updateStatusScoped(
    organizationId: string,
    id: string,
    expectedStatus: string,
    update: PurchaseOrderStatusUpdate,
  ): Promise<unknown | null>;
  findScopedForDelete(
    organizationId: string,
    id: string,
  ): Promise<{ id: string; status: string } | null>;
  deleteScoped(organizationId: string, id: string): Promise<boolean>;
}
