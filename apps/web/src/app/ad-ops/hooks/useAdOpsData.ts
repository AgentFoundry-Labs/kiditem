'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  AdCampaignSnapshot,
  AdProductSnapshot,
  AdTrendsData,
  AdWeeklyPlan,
  AdRulesData,
  DashboardSummary,
} from '@kiditem/shared';
import type { TabKey } from '../lib/types';

interface CampaignResponse {
  campaigns: AdCampaignSnapshot[];
  products: AdProductSnapshot[];
  totalKpi: Record<string, number>;
}

export function useAdOpsData(period: string, tab: TabKey) {
  const days = period === 'month' ? 30 : period === '14d' ? 14 : 7;
  const campPeriod = period === 'month' ? '30d' : '7d';

  const campaigns = useQuery({
    queryKey: queryKeys.ads.campaigns(campPeriod),
    queryFn: () => apiClient.get<CampaignResponse>(`/api/ads/campaigns?period=${campPeriod}`),
  });

  const rules = useQuery({
    queryKey: [...queryKeys.ads.all, 'rules', days] as const,
    queryFn: () => apiClient.get<AdRulesData>(`/api/ads/strategy/rules?days=${days}`),
  });

  const extensionStatus = useQuery({
    queryKey: queryKeys.ads.extensionStatus(),
    queryFn: () => apiClient.get<{ wing?: { kpis?: Record<string, string> } }>('/api/ads/extension/status'),
  });

  const dashboard = useQuery({
    queryKey: [...queryKeys.dashboard.all, 'summary', 'month'] as const,
    queryFn: () => apiClient.get<DashboardSummary>('/api/dashboard'),
  });

  const strategy = useQuery({
    queryKey: [...queryKeys.ads.all, 'plan', days] as const,
    queryFn: () => apiClient.get<AdWeeklyPlan>(`/api/ads/strategy/plan?days=${days}`),
    enabled: tab === 'status' || tab === 'strategy',
  });

  const trends = useQuery({
    queryKey: queryKeys.ads.trends(days),
    queryFn: () => apiClient.get<AdTrendsData>(`/api/ads/campaigns/trends?days=${days}`),
    enabled: tab === 'status',
  });

  const isLoading = campaigns.isLoading || rules.isLoading || extensionStatus.isLoading;

  return {
    campaigns,
    rules,
    extensionStatus,
    strategy,
    dashboard,
    trends,
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
