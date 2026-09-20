export interface SellpiaInventoryFreshnessGatePort {
  requireCollectedStock(input: {
    organizationId: string;
    attemptId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<{
    attemptId: string;
    fence: string;
    generation: string;
    completedAt: string;
    inventorySkus: Array<{ sellpiaInventorySkuId: string; currentStock: number }>;
  }>;

}

export const SELLPIA_INVENTORY_FRESHNESS_GATE_PORT = Symbol(
  'SELLPIA_INVENTORY_FRESHNESS_GATE_PORT',
);
