export type SellpiaFreshCapacity = {
  fence: string;
  generation: string;
  lastVerifiedAt: string;
  expiresAt: string;
  inventorySkus: Array<{
    sellpiaInventorySkuId: string;
    currentStock: number;
    activeCommitmentQuantity: number;
    availableStock: number;
    isActive: boolean;
  }>;
};

export type SellpiaFreshCapacityPreflightResult =
  | ({ status: 'fresh' } & SellpiaFreshCapacity)
  | { status: 'refresh_required'; requestedGeneration: string };

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
  }): Promise<SellpiaFreshCapacity>;

  readFreshCapacityOrRequest(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<SellpiaFreshCapacityPreflightResult>;
}

export const SELLPIA_INVENTORY_FRESHNESS_GATE_PORT = Symbol(
  'SELLPIA_INVENTORY_FRESHNESS_GATE_PORT',
);
