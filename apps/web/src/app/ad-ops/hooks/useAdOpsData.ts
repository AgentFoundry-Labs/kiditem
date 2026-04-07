'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  AdsHubData,
  AdCampaignSnapshot,
  AdProductSnapshot,
  AdBenchmarkData,
  AdTrendsData,
  AdWeeklyPlan,
  AdRulesData,
  DashboardSummary,
} from '@kiditem/shared';
import type { TabKey } from '../lib/types';

interface RecommendResponse {
  cards: Array<{
    icon: string;
    title: string;
    color: string;
    items: Array<{ productName?: string; text: string; value?: string; priority?: string }>;
  }>;
}

interface CampaignResponse {
  campaigns: AdCampaignSnapshot[];
  products: AdProductSnapshot[];
  totalKpi: Record<string, number>;
}

export function useAdOpsData(period: string, tab: TabKey) {
  const days = period === 'month' ? 30 : period === '14d' ? 14 : 7;
  const campPeriod = period === 'month' ? '30d' : '7d';

  // Always-on: needed for KPI cards + urgent count badge
  const campaigns = useQuery({
    queryKey: queryKeys.ads.campaigns(campPeriod),
    queryFn: () => apiClient.get<CampaignResponse>(`/api/ads/campaigns?period=${campPeriod}`),
  });

  // Bug #1 fix: inline key with days to avoid stale cache on period switch
  const rules = useQuery({
    queryKey: [...queryKeys.ads.all, 'rules', days] as const,
    queryFn: () => apiClient.get<AdRulesData>(`/api/ads/strategy/rules?days=${days}`),
  });

  const extensionStatus = useQuery({
    queryKey: queryKeys.ads.extensionStatus(),
    queryFn: () => apiClient.get<{ wing?: { kpis?: Record<string, string> } }>('/api/ads/extension/status'),
  });

  // Bug #2 fix: dedicated key to avoid collision with dashboard page's cache
  const dashboard = useQuery({
    queryKey: [...queryKeys.dashboard.all, 'summary', 'month'] as const,
    queryFn: () => apiClient.get<DashboardSummary>('/api/dashboard'),
  });

  // Bug #3 fix: tab-based query activation
  const strategy = useQuery({
    queryKey: [...queryKeys.ads.all, 'plan', days] as const,
    queryFn: () => apiClient.get<AdWeeklyPlan>(`/api/ads/strategy/plan?days=${days}`),
    enabled: tab === 'overview' || tab === 'strategy',
  });

  const adsList = useQuery({
    queryKey: [...queryKeys.ads.all, 'list', days] as const,
    queryFn: () => apiClient.get<AdsHubData>(`/api/ads?days=${days}`),
    enabled: tab === 'products',
  });

  const recommend = useQuery({
    queryKey: [...queryKeys.ads.all, 'recommend', days] as const,
    queryFn: () => apiClient.get<RecommendResponse>(`/api/ads/strategy/recommend?days=${days}`),
    enabled: tab === 'strategy',
  });

  const trends = useQuery({
    queryKey: queryKeys.ads.trends(days),
    queryFn: () => apiClient.get<AdTrendsData>(`/api/ads/campaigns/trends?days=${days}`),
    enabled: tab === 'overview',
  });

  const benchmark = useQuery({
    queryKey: [...queryKeys.ads.all, 'benchmark', days] as const,
    queryFn: () => apiClient.get<AdBenchmarkData>(`/api/ads/benchmark?days=${days}`),
    enabled: tab === 'overview',
  });

  const isLoading = campaigns.isLoading || rules.isLoading || extensionStatus.isLoading;

  return {
    campaigns,
    rules,
    extensionStatus,
    strategy,
    adsList,
    dashboard,
    recommend,
    trends,
    benchmark,
    isLoading,
  };
}

export function useCampaignProducts(campaignName: string | null, period: string) {
  return useQuery({
    queryKey: queryKeys.ads.campaignProducts(campaignName ?? '', period),
    queryFn: () =>
      apiClient.get<{ products: AdProductSnapshot[] }>(
        `/api/ads/campaigns?campaign=${encodeURIComponent(campaignName!)}&period=${period}`,
      ),
    enabled: !!campaignName,
  });
}

export function useRefreshAdOps() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
}
