'use client';

import { AdCampaignSyncStatusSchema } from '@kiditem/shared/advertising';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function useAdCampaignSyncStatus() {
  return useQuery({
    queryKey: queryKeys.ads.campaignSyncStatus(),
    queryFn: () =>
      apiClient.getParsed(
        '/api/ads/campaigns/sync-status',
        AdCampaignSyncStatusSchema,
      ),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
}
