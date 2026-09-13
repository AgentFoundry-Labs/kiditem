// Outgoing port for hydrating the strategy-context aggregate used by
// AdStrategyService. The adapter loads everything strategy sub-services
// need from `ChannelListingDailySnapshot` and friends; ratios stay
// recomputed downstream.
//
// Important: this port does NOT fetch `AdsConfig`. The application service
// (AdStrategyService) calls `AdConfigService.getConfig` first and passes
// the result into `loadStrategyContext` so the adapter has zero
// application-layer back-references.

import type {
  AdAggregateRow,
  AdsConfig,
  HydratedListing,
} from '../../../../domain/model/strategy-types';
import type { ChannelStateSignal } from '@kiditem/shared/advertising';
import type { AdPeriod } from '../../../../domain/ad-metrics';

export const AD_STRATEGY_CONTEXT_REPOSITORY_PORT = Symbol(
  'AdStrategyContextRepositoryPort',
);

export interface StrategyContext {
  adGroups: AdAggregateRow[];
  adIssuesAdGroups: AdAggregateRow[];
  listings: HydratedListing[];
  profitRateByListing: Map<string, number>;
  /**
   * Context listings whose profit was withheld for an unmeasured cost input,
   * and so are absent from `profitRateByListing`.
   */
  profitWithheldListings: number;
  channelStateByListing: Map<string, ChannelStateSignal>;
  gradeMap: Map<string, 'A' | 'B' | 'C' | null>;
  trafficByListing: Map<string, { revenue: number; orders: number }>;
  config: AdsConfig;
}

export interface AdStrategyContextRepositoryPort {
  /**
   * Hydrate every strategy sub-service input. Caller passes the resolved
   * `AdsConfig` so the adapter has no application-service dependency.
   */
  loadStrategyContext(
    organizationId: string,
    year: number,
    month: number,
    period: AdPeriod,
    config: AdsConfig,
  ): Promise<StrategyContext>;
}
