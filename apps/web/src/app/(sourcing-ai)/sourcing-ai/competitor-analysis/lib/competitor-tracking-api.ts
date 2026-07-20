import { apiClient } from "@/lib/api-client";

export type CompetitorCollectionStatus =
  "catalog_empty" | "not_configured" | "not_collected" | "ready";

export interface MatchedOwnProduct {
  vendorItemId: string;
  skuId: string;
  productName: string;
  category: string | null;
  score: number;
  sharedTerms: string[];
}

export interface CompetitorTrackedProduct {
  productKey: string;
  productId: string | null;
  vendorItemId: string | null;
  name: string;
  link: string | null;
  imageUrl: string | null;
  keywords: string[];
  rank: number;
  isAd: boolean;
  priceKrw: number | null;
  reviewCount: number | null;
  ratingScore: number | null;
  rankChange: number | null;
  priceChange: number | null;
  reviewChange: number | null;
  capturedAt: string;
  matchedOwnProducts: MatchedOwnProduct[];
}

export interface CompetitorSellerCatalogProduct {
  productKey: string;
  productId: string | null;
  itemId: string | null;
  vendorItemId: string | null;
  name: string;
  link: string | null;
  imageUrl: string | null;
  priceKrw: number | null;
  reviewCount: number | null;
  sourceRank: number;
  firstSeenAt: string;
  lastSeenAt: string;
  isNew: boolean;
}

export interface CompetitorSellerCatalog {
  sellerStoreUrl: string;
  sort: "newest";
  totalProductCount: number | null;
  collectedProductCount: number;
  isTruncated: boolean;
  newProductCount: number;
  lastCapturedAt: string;
  products: CompetitorSellerCatalogProduct[];
}

export interface CompetitorSeller {
  sellerKey: string;
  sellerName: string;
  brandName: string | null;
  sellerId: string | null;
  sellerStoreUrl: string | null;
  sellerResolved: boolean;
  watchlisted: boolean;
  discoverySource: "user" | "kiditem" | null;
  priorityScore: number;
  overlapProductCount: number;
  matchedOwnProductCount: number;
  trackedKeywordCount: number;
  top10Count: number;
  organicExposureCount: number;
  averageRank: number | null;
  totalReviewCount: number;
  recentChangeCount: number;
  lastCapturedAt: string | null;
  products: CompetitorTrackedProduct[];
  catalog: CompetitorSellerCatalog | null;
}

export interface CompetitorTrackingOverview {
  periodDays: number;
  collection: {
    status: CompetitorCollectionStatus;
    ownProductCount: number;
    wingProductCount: number;
    storefrontProductCount: number;
    storefrontStatus: "ready" | "unavailable";
    trackerCount: number;
    enabledTrackerCount: number;
    trackedKeywords: string[];
    suggestedKeywords: string[];
    watchedCompetitors: Array<{
      sellerId: string;
      sellerName: string;
      sellerStoreUrl: string;
      brandName: string;
      discoverySource: "user" | "kiditem";
      discoveryKeyword: string;
      knownProductIds: string[];
      knownVendorItemIds: string[];
    }>;
    lastCapturedAt: string | null;
  };
  summary: {
    trackedSellerCount: number;
    topSellerCount: number;
    overlappingProductCount: number;
    matchedOwnProductCount: number;
    trackedKeywordCount: number;
    unresolvedSellerProductCount: number;
    lastCapturedAt: string | null;
  };
  sellers: CompetitorSeller[];
}

export interface AutoConfigureCompetitorTrackersResponse {
  configuredCount: number;
  keywords: string[];
  storefrontProductCount: number;
}

export function fetchCompetitorTrackingOverview(
  days: number,
): Promise<CompetitorTrackingOverview> {
  return apiClient.get<CompetitorTrackingOverview>(
    `/api/ads/competitors?days=${days}&limit=30`,
  );
}

export function autoConfigureCompetitorTrackers(
  maxKeywords = 12,
): Promise<AutoConfigureCompetitorTrackersResponse> {
  return apiClient.post<AutoConfigureCompetitorTrackersResponse>(
    "/api/ads/competitors/trackers/auto",
    { maxKeywords },
  );
}
