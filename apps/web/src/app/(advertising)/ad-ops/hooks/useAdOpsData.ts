'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  AdCampaignSnapshot,
  AdExtensionStatus,
  AdKeywordsData,
  AdProductSnapshot,
  AdRulesData,
  AdWeeklyPlan,
  AdTrendsData,
  ExposureAnalysisData,
} from '@kiditem/shared/advertising';

export type CampaignProductData = {
  vendorItemId: string;
  productName: string;
  keyword: string | null;
  onOff: string | null;
  imageUrl?: string | null;
  adSpend: number;
  adRevenue: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  adConversions: number;
  conversionRate: number | null;
  roas: number | null;
};

type CampaignsResponse = {
  campaigns: AdCampaignSnapshot[];
  totalKpi: Record<string, number>;
};

export type RoasThresholds = {
  excellent: number;
  warning: number;
  poor: number;
};

const DEFAULT_ROAS_THRESHOLDS: RoasThresholds = {
  excellent: 300,
  warning: 200,
  poor: 100,
};

// The page refresh button explicitly invalidates these queries, so a short
// freshness window removes needless remount/tab refetches without hiding a
// deliberate operator refresh.
const AD_OPS_METRIC_STALE_TIME = 60_000;
const EXTENSION_STATUS_STALE_TIME = 5 * 60_000;

// H3 — `/api/ads/extension/status` shape moved to current-state semantics.
// `snapshotCount` is now `rawSnapshotCount` (counts ChannelScrapeSnapshot rows
// instead of legacy AdSnapshot), and `itemWinnerCount` is now
// `currentWinnerObservedListings` (latest daily-fact observed listings instead
// of legacy ItemWinner row count). Aliased to the shared schema type.
// H3: StatusContent surfaces `latestScrapeAt` / `latestChannelStateAt` /
// `rawSnapshotCount` / `currentWinnerObservedListings` in the 아이템위너 카드.
// `latestScrapePageType` stays on the wire (could feed a debug panel) but is
// not user-facing — the raw page slug ('itemwinner', 'campaign', ...) carries
// no operator value beyond what `latestScrapeAt` already conveys.
type ExtensionStatusResponse = AdExtensionStatus;

export type RegisterCampaignPayload = {
  grade: string;
  color: string;
  campaignName: string;
  adGroupName: string;
  dailyBudget: number;
  operationMode: string;
  smartTargetingBid: number;
  nonSearchBid: number;
  targetRoas: number;
  keywords: { keyword: string; bidPrice: number }[];
  products: { productId: string; productName: string }[];
};

function campaignTotals(campaigns: AdCampaignSnapshot[]): Record<string, number> {
  const total = campaigns
    .filter((campaign) => campaign.metricsAvailable !== false)
    .reduce(
      (acc, c) => ({
        adSpend: acc.adSpend + c.metrics.spend,
        adRevenue: acc.adRevenue + c.metrics.revenue,
        impressions: acc.impressions + c.metrics.impressions,
        clicks: acc.clicks + c.metrics.clicks,
        conversions: acc.conversions + c.metrics.conversions,
      }),
      { adSpend: 0, adRevenue: 0, impressions: 0, clicks: 0, conversions: 0 },
    );
  return {
    ...total,
    roas: total.adSpend > 0 ? Math.round((total.adRevenue / total.adSpend) * 10000) / 100 : 0,
    ctr: total.impressions > 0 ? Math.round((total.clicks / total.impressions) * 10000) / 100 : 0,
    cvr: total.clicks > 0 ? Math.round((total.conversions / total.clicks) * 10000) / 100 : 0,
  };
}

export function toCampaignsResponse(campaigns: AdCampaignSnapshot[]): CampaignsResponse {
  return { campaigns, totalKpi: campaignTotals(campaigns) };
}

export function useAdsConfig(): RoasThresholds {
  const { data } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () =>
      apiClient.get<{ roas: { thresholds: RoasThresholds } }>('/api/ads/config'),
    staleTime: 5 * 60 * 1000,
  });
  return data?.roas?.thresholds ?? DEFAULT_ROAS_THRESHOLDS;
}

export function useAdOpsData(period: string, tab: string) {
  const campPeriod = period;
  const needsStrategyPlan = tab === 'status' || tab === 'strategy';
  const needsExtensionStatus = tab === 'status';

  const campaigns = useQuery({
    queryKey: queryKeys.ads.campaigns(campPeriod),
    queryFn: () =>
      apiClient
        .get<AdCampaignSnapshot[]>(`/api/ads/campaigns?period=${campPeriod}`)
        .then(toCampaignsResponse),
    placeholderData: previousData => previousData,
    staleTime: AD_OPS_METRIC_STALE_TIME,
  });

  const rules = useQuery({
    queryKey: queryKeys.ads.rules(period),
    queryFn: () =>
      apiClient.get<AdRulesData>(`/api/ads/strategy/rules?period=${period}`),
    placeholderData: previousData => previousData,
    staleTime: AD_OPS_METRIC_STALE_TIME,
  });

  const wingStatus = useQuery({
    queryKey: queryKeys.ads.extensionStatus(),
    queryFn: () =>
      apiClient.get<ExtensionStatusResponse>(`/api/ads/extension/status`),
    enabled: needsExtensionStatus,
    staleTime: EXTENSION_STATUS_STALE_TIME,
  });

  const strategy = useQuery({
    queryKey: queryKeys.ads.plan(period),
    queryFn: () =>
      apiClient.get<AdWeeklyPlan>(`/api/ads/strategy/plan?period=${period}`),
    enabled: needsStrategyPlan,
    placeholderData: previousData => previousData,
    staleTime: AD_OPS_METRIC_STALE_TIME,
  });

  const trends = useQuery({
    queryKey: queryKeys.ads.trends(period),
    queryFn: () =>
      apiClient.get<AdTrendsData>(`/api/ads/campaigns/trends?period=${period}`),
    placeholderData: previousData => previousData,
    staleTime: AD_OPS_METRIC_STALE_TIME,
  });

  const exposure = useQuery({
    queryKey: [...queryKeys.ads.all, 'exposure-analysis'] as const,
    queryFn: () =>
      apiClient.get<ExposureAnalysisData>(`/api/ads/exposure-analysis`),
    enabled: tab === 'exposure',
    staleTime: AD_OPS_METRIC_STALE_TIME,
  });

  const isLoading =
    campaigns.isLoading ||
    rules.isLoading ||
    (needsExtensionStatus && wingStatus.isLoading) ||
    (needsStrategyPlan && strategy.isLoading);
  const isRefreshing =
    !isLoading && (
      campaigns.isFetching ||
      rules.isFetching ||
      wingStatus.isFetching ||
      strategy.isFetching ||
      trends.isFetching ||
      exposure.isFetching
    );

  return {
    campaigns,
    rules,
    wingStatus,
    strategy,
    trends,
    exposure,
    isLoading,
    isRefreshing,
  };
}

export type AdProductRow = CampaignProductData & { campaignName: string };

export function useAdProducts(period: string, enabled: boolean) {
  const campPeriod = period;

  const productsQuery = useQuery({
    queryKey: queryKeys.ads.products(campPeriod),
    queryFn: () =>
      apiClient.get<AdProductSnapshot[]>(`/api/ads/products?period=${campPeriod}`),
    enabled,
  });

  const products: AdProductRow[] = (productsQuery.data ?? []).map((snapshot) => ({
    vendorItemId:
      snapshot.externalOptionId ??
      snapshot.externalId ??
      snapshot.listing?.externalId ??
      '',
    productName:
      snapshot.productName ??
      snapshot.listing?.channelName ??
      snapshot.listing?.masterProduct.name ??
      '(이름 없음)',
    keyword: snapshot.keyword,
    onOff: snapshot.onOff,
    imageUrl: snapshot.imageUrl,
    adSpend: snapshot.metrics.spend,
    adRevenue: snapshot.metrics.revenue,
    impressions: snapshot.metrics.impressions,
    clicks: snapshot.metrics.clicks,
    ctr: snapshot.metrics.ctr,
    adConversions: snapshot.metrics.conversions,
    conversionRate: snapshot.metrics.cvr,
    roas: snapshot.metrics.roas,
    campaignName: snapshot.campaignName ?? '',
  }));

  return {
    products,
    isLoading: productsQuery.isLoading,
    isFetching: productsQuery.isFetching,
    isError: productsQuery.isError,
    error: productsQuery.error,
    refetch: productsQuery.refetch,
  };
}

/**
 * Per-product keyword footprint collected from the ad centre keyword table.
 *
 * Enabled only while the keyword tab is open: the payload carries every keyword
 * of every advertised product, which is an order of magnitude larger than the
 * product list.
 */
export function useAdKeywords(period: string, enabled: boolean) {
  const query = useQuery({
    queryKey: queryKeys.ads.keywords(period),
    queryFn: () => apiClient.get<AdKeywordsData>(`/api/ads/keywords?period=${period}`),
    enabled,
  });

  return {
    products: query.data?.products ?? [],
    keywords: query.data?.keywords ?? [],
    collectedAt: query.data?.collectedAt ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export type KeywordRelevanceRunResult = {
  ok: boolean;
  reason: string;
  judgedProductCount: number;
  judgedKeywordCount: number;
  irrelevantCount: number;
  created: number;
  failedProductCount: number;
  skippedProductCount: number;
  truncatedKeywordCount: number;
};

/**
 * Classify collected keywords against the product they advertise. It only
 * proposes: keywords judged irrelevant become `pause_keyword` actions awaiting
 * approval, never an immediate pause.
 *
 * Pass `externalOptionId` to judge a single product instead of the account.
 */
export function useRunKeywordAgent(period: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input?: { externalOptionId?: string }) =>
      apiClient.post<KeywordRelevanceRunResult>(
        '/api/ads/keywords/agent/run',
        input?.externalOptionId
          ? { externalOptionId: input.externalOptionId }
          : {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.keywords(period) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
    },
  });
}

export function useRegisterCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterCampaignPayload) =>
      apiClient.post('/api/ads/campaigns/register', {
        campaignName: payload.campaignName,
        adGroupName: payload.adGroupName,
        grade: payload.grade,
        dailyBudget: payload.dailyBudget,
        operationMode: payload.operationMode,
        listings: payload.products.map((product) => ({
          listingId: product.productId,
          label: product.productName,
        })),
        smartTargetingBid: payload.smartTargetingBid,
        keywords: payload.keywords,
        nonSearchBid: payload.nonSearchBid,
        targetRoas: payload.targetRoas,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.campaigns() });
    },
  });
}
