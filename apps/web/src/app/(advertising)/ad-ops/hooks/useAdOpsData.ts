'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  AdCampaignSnapshot,
  AdExtensionStatus,
  AdProductSnapshot,
  AdRulesData,
  AdWeeklyPlan,
  AdsHubData,
  AdBenchmarkData,
  AdTrendsData,
  ExposureAnalysisData,
} from '@kiditem/shared/advertising';
import type { DashboardAdSummary } from '@kiditem/shared/dashboard';

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

type TrafficSummaryResponse = {
  days: number;
  revenue: number;
  orders: number;
  salesQty: number;
  visitors: number;
  views: number;
  cartAdds: number;
  prevRevenue: number;
  prevOrders: number;
  revenueChange: number;
  ordersChange: number;
};

type RecommendResponse = {
  cards: Record<string, unknown>[];
  keyMetrics: Record<string, unknown> | null;
};

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
  const total = campaigns.reduce(
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
  const days = period === 'month' ? new Date().getDate() : period === '14d' ? 14 : 7;
  const campPeriod = period;
  const trafficDays = days;

  const campaigns = useQuery({
    queryKey: queryKeys.ads.campaigns(campPeriod),
    queryFn: () =>
      apiClient
        .get<AdCampaignSnapshot[]>(`/api/ads/campaigns?period=${campPeriod}`)
        .then(toCampaignsResponse),
    placeholderData: previousData => previousData,
  });

  const rules = useQuery({
    queryKey: queryKeys.ads.rules(period),
    queryFn: () =>
      apiClient.get<AdRulesData>(`/api/ads/strategy/rules?period=${period}`),
    placeholderData: previousData => previousData,
  });

  const wingStatus = useQuery({
    queryKey: queryKeys.ads.extensionStatus(),
    queryFn: () =>
      apiClient.get<ExtensionStatusResponse>(`/api/ads/extension/status`),
  });

  const strategy = useQuery({
    queryKey: queryKeys.ads.plan(period),
    queryFn: () =>
      apiClient.get<AdWeeklyPlan>(`/api/ads/strategy/plan?period=${period}`),
    placeholderData: previousData => previousData,
  });

  const adsHub = useQuery({
    queryKey: [...queryKeys.ads.list(), days] as const,
    queryFn: () =>
      apiClient.get<AdsHubData>(`/api/ads?days=${days}`),
    placeholderData: previousData => previousData,
  });

  const dashboard = useQuery({
    queryKey: queryKeys.dashboard.adBaseline(),
    queryFn: () =>
      apiClient.get<DashboardAdSummary>('/api/dashboard/ad'),
  });

  const recommend = useQuery({
    queryKey: queryKeys.ads.recommend(period),
    queryFn: () =>
      apiClient.get<RecommendResponse>(`/api/ads/strategy/recommend`),
    placeholderData: previousData => previousData,
  });

  const trends = useQuery({
    queryKey: queryKeys.ads.trends(period),
    queryFn: () =>
      apiClient.get<AdTrendsData>(`/api/ads/campaigns/trends?period=${period}`),
    placeholderData: previousData => previousData,
  });

  const benchmark = useQuery({
    queryKey: queryKeys.ads.benchmark(period),
    queryFn: () =>
      apiClient.get<AdBenchmarkData>(`/api/ads/benchmark?days=${days}`),
    placeholderData: previousData => previousData,
  });

  const trafficSummary = useQuery({
    queryKey: ['traffic', 'summary', trafficDays] as const,
    queryFn: () =>
      apiClient.get<TrafficSummaryResponse>(`/api/traffic/summary?days=${trafficDays}`),
    placeholderData: previousData => previousData,
  });

  const exposure = useQuery({
    queryKey: [...queryKeys.ads.all, 'exposure-analysis'] as const,
    queryFn: () =>
      apiClient.get<ExposureAnalysisData>(`/api/ads/exposure-analysis`),
    enabled: tab === 'exposure',
  });

  const isLoading =
    campaigns.isLoading ||
    rules.isLoading ||
    wingStatus.isLoading ||
    strategy.isLoading ||
    adsHub.isLoading ||
    dashboard.isLoading;
  const isRefreshing =
    !isLoading && (
      campaigns.isFetching ||
      rules.isFetching ||
      strategy.isFetching ||
      adsHub.isFetching ||
      trends.isFetching ||
      benchmark.isFetching ||
      trafficSummary.isFetching
    );

  return {
    campaigns,
    rules,
    wingStatus,
    strategy,
    adsHub,
    dashboard,
    recommend,
    trends,
    benchmark,
    exposure,
    trafficSummary,
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
    placeholderData: previousData => previousData,
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
  };
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
