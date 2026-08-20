export const MARKET_SHADOW_COLLECTION_CAPABILITY_PORT = Symbol(
  'MARKET_SHADOW_COLLECTION_CAPABILITY_PORT',
);

export interface MarketShadowCollectionCapabilityInput {
  organizationId: string;
}

export interface MarketShadowCollectionCapabilityResult {
  operationRunId: string;
  status: string;
}

export interface MarketShadowCollectionCapabilityPort {
  collectShadowSignals(
    input: MarketShadowCollectionCapabilityInput,
  ): Promise<MarketShadowCollectionCapabilityResult>;
}
