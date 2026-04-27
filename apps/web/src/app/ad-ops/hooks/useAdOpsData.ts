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
  DashboardAdSummary,
} from '@kiditem/shared';

// Fields returned by /api/ads/campaigns that aren't in the base snapshot schema
export type CampaignProductData = AdProductSnapshot & {
  roas?: number;
  imageUrl?: string | null;
};

export type CampaignsResponse = {
  campaigns: AdCampaignSnapshot[];
  totalKpi: Record<string, number>;
};

// H3 — `/api/ads/extension/status` shape moved to current-state semantics.
// `snapshotCount` is now `rawSnapshotCount` (counts ChannelScrapeSnapshot rows
// instead of legacy AdSnapshot), and `itemWinnerCount` is now
// `currentWinnerObservedListings` (latest daily-fact observed listings instead
// of legacy ItemWinner row count). Aliased to the shared schema type.
export type ExtensionStatusResponse = AdExtensionStatus;

export type TrafficSummaryResponse = {
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

export type RecommendResponse = {
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

export function useAdOpsData(period: string, tab: string) {
  const days = period === 'month' ? new Date().getDate() : period === '14d' ? 14 : 7;
  // DB에는 7d/30d 스냅샷만 존재 — 14d 선택 시 7d 스냅샷으로 폴백
  const campPeriod = period === 'month' ? '30d' : period === '14d' ? '7d' : period;
  const trafficDays = days;

  const campaigns = useQuery({
    queryKey: queryKeys.ads.campaigns(campPeriod),
    queryFn: () =>
      apiClient.get<CampaignsResponse>(`/api/ads/campaigns?period=${campPeriod}`),
  });

  const rules = useQuery({
    queryKey: queryKeys.ads.rules(period),
    queryFn: () =>
      apiClient.get<AdRulesData>(`/api/ads/strategy/rules?period=${period}`),
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
  });

  const adsHub = useQuery({
    queryKey: queryKeys.ads.list(),
    queryFn: () =>
      apiClient.get<AdsHubData>(`/api/ads?days=${days}`),
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
  });

  const trends = useQuery({
    queryKey: queryKeys.ads.trends(period),
    queryFn: () =>
      apiClient.get<AdTrendsData>(`/api/ads/campaigns/trends?period=${period}`),
  });

  const benchmark = useQuery({
    queryKey: queryKeys.ads.benchmark(period),
    queryFn: () =>
      apiClient.get<AdBenchmarkData>(`/api/ads/benchmark?days=${days}`),
  });

  const trafficSummary = useQuery({
    queryKey: ['traffic', 'summary', trafficDays] as const,
    queryFn: () =>
      apiClient.get<TrafficSummaryResponse>(`/api/traffic/summary?days=${trafficDays}`),
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
  };
}

export function useAdOpsSelectedCampaign(
  selectedCampaign: string | null,
  period: string,
) {
  return useQuery({
    queryKey: queryKeys.ads.campaignProducts(selectedCampaign ?? '', period),
    queryFn: () =>
      apiClient.get<{ products: CampaignProductData[] }>(
        `/api/ads/campaigns?campaign=${encodeURIComponent(selectedCampaign!)}&period=${period}`,
      ),
    enabled: selectedCampaign !== null,
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
        products: payload.products,
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

export function useAiRefreshPlan(period: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<AdWeeklyPlan>(`/api/ads/strategy/ai-plan?period=${period}`, {}),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.ads.plan(period), data);
    },
  });
}
