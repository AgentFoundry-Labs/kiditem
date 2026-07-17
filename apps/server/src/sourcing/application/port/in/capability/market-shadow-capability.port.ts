export const MARKET_SHADOW_COLLECTION_CAPABILITY_PORT = Symbol(
  'MARKET_SHADOW_COLLECTION_CAPABILITY_PORT',
);

export interface MarketShadowCollectionCapabilityInput {
  organizationId: string;
}

export interface MarketShadowCollectionCapabilityResult {
  claimed: boolean;
  snapshotId: string;
  businessDate: string;
  status: string;
  decisionImpact: 'disabled';
}

export interface MarketShadowCollectionCapabilityPort {
  collectShadowSignals(
    input: MarketShadowCollectionCapabilityInput,
  ): Promise<MarketShadowCollectionCapabilityResult>;
}
