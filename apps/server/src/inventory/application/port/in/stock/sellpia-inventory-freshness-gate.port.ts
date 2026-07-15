export interface SellpiaInventoryFreshnessGatePort {
  assertFreshAndActive(input: {
    organizationId: string;
    masterProductIds: string[];
  }): Promise<{
    fence: string;
    lastVerifiedAt: string;
    expiresAt: string;
  }>;
}

export const SELLPIA_INVENTORY_FRESHNESS_GATE_PORT = Symbol(
  'SELLPIA_INVENTORY_FRESHNESS_GATE_PORT',
);
