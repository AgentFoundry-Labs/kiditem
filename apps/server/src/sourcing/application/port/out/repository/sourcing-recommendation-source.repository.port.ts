export const SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT = Symbol(
  'SourcingRecommendationSourceRepositoryPort',
);

export interface SourcingOfferObservationSource {
  id: string;
  evidenceObservationId: string;
  ingestionRunId: string;
  businessDate: Date;
  sourceKeyword: string;
  externalOfferId: string;
  variantKey: string;
  sourceUrl: string | null;
  title: string | null;
  supplierName: string | null;
  imageUrl: string | null;
  rank: number | null;
  priceCny: number | null;
  monthlySales: number | null;
  capturedAt: Date;
  rawOffer: Record<string, unknown>;
}

export interface SourcingCoupangObservationSource {
  evidenceObservationId: string;
  productId: string;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string;
  sourceKeyword: string;
  salePriceKrw: number | null;
  ratingCount: number | null;
  ratingAverage: number | null;
  viewsLast28d: number | null;
  salesLast28d: number | null;
  capturedAt: Date;
}

export interface SourcingRecommendationSourceRepositoryPort {
  listLatestOfferObservations(input: {
    organizationId: string;
    cutoffAt: Date;
    lookbackDays: number;
    limit: number;
  }): Promise<{ items: SourcingOfferObservationSource[]; rejectedCount: number }>;

  listLatestCoupangObservations(input: {
    organizationId: string;
    cutoffAt: Date;
    lookbackDays: number;
    limit: number;
  }): Promise<{ items: SourcingCoupangObservationSource[]; rejectedCount: number }>;

  listWingCatalogSnapshot(input: {
    organizationId: string;
    normalizedKeyword: string;
    limit: number;
  }): Promise<{
    items: import('@kiditem/shared/sourcing').SourcingWingCatalogObservation[];
    rejectedCount: number;
  }>;
}
