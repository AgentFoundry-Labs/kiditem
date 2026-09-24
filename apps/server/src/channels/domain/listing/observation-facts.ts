import type { DailyTrafficFactSource } from '@kiditem/shared/advertising';

export type ListingTrafficTotals = Readonly<{
  visitors: number;
  views: number;
  cartAdds: number;
  orders: number;
  salesQty: number;
  revenue: number;
}>;

export type ListingTrafficDailyFact = ListingTrafficTotals & Readonly<{
  listingId: string;
  businessDate: string;
  observedAt: Date;
  source: DailyTrafficFactSource | null;
}>;

export type ListingTrafficWindowFacts = Readonly<{
  rows: readonly ListingTrafficDailyFact[];
  /** Dates with an explicit traffic row before the current-generation fence. */
  observedDates: readonly string[];
  /** Owner-declared coverage for the listing population selected by this read. */
  coverage: Readonly<{
    includedDates: readonly string[];
    invalidDates: readonly string[];
    missingDates: readonly string[];
  }>;
  totals: ListingTrafficTotals;
  latestObservedAt: Date | null;
}>;

export type ListingSaleStatusFact = Readonly<{
  listingId: string;
  businessDate: string;
  saleStatus: string | null;
  observedAt: Date;
}>;


export type ListingStateFact = Readonly<{
  listingId: string;
  channel: string;
  externalId: string;
  businessDate: Date;
  lastObservedAt: Date;
  sampleCount: number;
  productName: string | null;
  status: string | null;
  exposureStatus: string | null;
  saleStatus: string | null;
  channelPrice: number | null;
  isOfferWinner: boolean | null;
  myPrice: number | null;
  winnerPrice: number | null;
  winnerGapPrice: number | null;
  productRank: number | null;
  categoryRank: number | null;
}>;
