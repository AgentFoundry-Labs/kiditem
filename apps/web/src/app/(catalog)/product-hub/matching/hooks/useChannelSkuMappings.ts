'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { issueBrowserCollectionRunId } from '@/lib/browser-collection-session';
import {
  autoMatchChannelProducts,
  getSellpiaManualMatchTargets,
  importCoupangWingCatalog,
  importSellpiaManualMatchSnapshot,
  linkChannelListingProduct,
  listChannelAccounts,
  listChannelProductCandidates,
  listChannelProductMappings,
} from '../lib/channel-sku-matching-api';
import {
  collectSellpiaManualMatchSnapshot,
  finalizeSellpiaManualMatchCollection,
} from '../lib/sellpia-manual-match-collection';
import type { CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';

export function useChannelAccounts() {
  return useQuery({ queryKey: queryKeys.channelAccounts.active(), queryFn: listChannelAccounts });
}

export function useChannelProductMappings(params: {
  channelAccountId?: string;
  search?: string;
  enabled?: boolean;
}) {
  const normalizedSearch = params.search?.trim() ?? '';
  return useQuery({
    queryKey: queryKeys.channelProductMappings.list({
      channelAccountId: params.channelAccountId ?? '',
      search: normalizedSearch,
    }),
    queryFn: () => listChannelProductMappings({
      channelAccountId: params.channelAccountId,
      search: normalizedSearch,
    }),
    enabled: params.enabled ?? Boolean(params.channelAccountId),
  });
}

export function useRunChannelProductMatching() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ channelAccountIds }: { channelAccountIds: string[] }) => {
      const uniqueAccountIds = [...new Set(channelAccountIds)].sort();
      if (uniqueAccountIds.length === 0) {
        throw new Error('상품 매칭을 실행할 채널 계정이 없습니다.');
      }

      const targets = await getSellpiaManualMatchTargets();
      const runId = await issueBrowserCollectionRunId();
      const collected = await collectSellpiaManualMatchSnapshot(
        runId,
        targets.targetCodes,
      );
      let collectedAliases = 0;
      try {
        const imported = await importSellpiaManualMatchSnapshot(collected.snapshot);
        collectedAliases = imported.status.aliasCount;
        await finalizeSellpiaManualMatchCollection(
          collected,
          'succeeded',
          `Sellpia 수동상품매칭 별칭 ${imported.status.aliasCount}개를 저장했습니다.`,
        );
      } catch (error) {
        await finalizeSellpiaManualMatchCollection(
          collected,
          'failed',
          error instanceof Error ? error.message : '수동상품매칭 근거 저장 실패',
        ).catch(() => undefined);
        throw error;
      }

      const result = { collectedAliases, evaluatedListings: 0, matchedListings: 0, configuredOptions: 0 };
      for (const channelAccountId of uniqueAccountIds) {
        const applied = await autoMatchChannelProducts(channelAccountId);
        result.evaluatedListings += applied.evaluatedListings;
        result.matchedListings += applied.matchedListings;
        result.configuredOptions += applied.configuredOptions;
      }
      return result;
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.channelProductMappings.sellpiaManualMatchTargets(),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.channelProductMappings.all,
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuAvailability.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
    ]),
  });
}

export function useChannelProductCandidates(channelListingId: string | null, search: string, enabled: boolean) {
  const normalized = search.trim();
  return useQuery({
    queryKey: queryKeys.channelProductMappings.productCandidates(channelListingId ?? '', { search: normalized }),
    queryFn: () => listChannelProductCandidates(channelListingId ?? '', normalized),
    enabled: enabled && Boolean(channelListingId),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}


export function useLinkChannelListingProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ channelListingId, masterProductId }: { channelListingId: string; masterProductId: string | null }) =>
      linkChannelListingProduct(channelListingId, { masterProductId }),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.channelProductMappings.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuAvailability.all }),
    ]),
  });
}


export function useImportCoupangWingCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ channelAccountId, file }: { channelAccountId: string; file: File }): Promise<{
      response: CoupangWingCatalogImportResponse;
      statusRefreshFailed: boolean;
    }> => ({
      response: await importCoupangWingCatalog(channelAccountId, file),
      statusRefreshFailed: false,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.channelProductMappings.all }),
  });
}
