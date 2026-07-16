export interface SellpiaInventoryFreshnessGatePort {
  assertFreshAndActive(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<{
    fence: string;
    lastVerifiedAt: string;
    expiresAt: string;
  }>;

  readFreshCapacity(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<{
    fence: string;
    generation: string;
    lastVerifiedAt: string;
    expiresAt: string;
    inventorySkus: Array<{
      sellpiaInventorySkuId: string;
      currentStock: number;
      isActive: boolean;
    }>;
  }>;
}

export const SELLPIA_INVENTORY_FRESHNESS_GATE_PORT = Symbol(
  'SELLPIA_INVENTORY_FRESHNESS_GATE_PORT',
);
