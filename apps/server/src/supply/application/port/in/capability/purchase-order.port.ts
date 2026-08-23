export const SUPPLY_PURCHASE_ORDER_CAPABILITY_PORT = Symbol(
  'SUPPLY_PURCHASE_ORDER_CAPABILITY_PORT',
);

export interface SupplyPurchaseOrderCapabilityPort {
  createPurchaseOrderDraft(input: Record<string, unknown>): Promise<{ orderId: string; status: string }>;
  submitPurchaseOrder(input: Record<string, unknown>): Promise<{ orderId: string; status: string }>;
}
