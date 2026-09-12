import type { MarketShadowCollectionResult } from '../../../service/sourcing-shadow-signal.service';

export const MARKET_SHADOW_COLLECTION_CAPABILITY_PORT = Symbol(
  'MARKET_SHADOW_COLLECTION_CAPABILITY_PORT',
);

export interface MarketShadowCollectionCapabilityInput {
  organizationId: string;
  requestedByUserId?: string | null;
  idempotencyKey: string;
}

export type MarketShadowCollectionCapabilityResult = MarketShadowCollectionResult;

export interface MarketShadowCollectionCapabilityPort {
  collectShadowSignals(
    input: MarketShadowCollectionCapabilityInput,
  ): Promise<MarketShadowCollectionCapabilityResult>;
}
