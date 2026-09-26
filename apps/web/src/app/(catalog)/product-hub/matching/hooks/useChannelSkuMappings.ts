'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/query-keys';
import {
  autoMatchChannelProducts,
  importCoupangRocketMatchingCsv,
  type RocketMatchingCsvUpload,
  importCoupangWingCatalog,
  listChannelAccounts,
  listChannelProductMappings,
  listRecipeComponentCandidates,
  saveProductInventoryMatching,
} from '../lib/channel-sku-matching-api';
import {
  collectSellpiaManualMatchSnapshot,
} from '../lib/sellpia-manual-match-collection';
import type { WingCatalogWorkbookUpload } from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/wing-catalog-collection';

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
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ channelAccountIds }: { channelAccountIds: string[] }) => {
      const uniqueAccountIds = [...new Set(channelAccountIds)].sort();
      if (uniqueAccountIds.length === 0) {
        throw new Error('상품 매칭을 실행할 채널 계정이 없습니다.');
      }

      const collected = await collectSellpiaManualMatchSnapshot({
        organizationId: user?.organizationId ?? '',
      });
      const collectedAliases = collected.status.aliasCount;

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

export function useRecipeComponentCandidates(
  search: string,
  includeOutOfStock: boolean,
  enabled: boolean,
) {
  const normalized = search.trim();
  const params = {
    search: normalized,
    stockStatus: includeOutOfStock ? 'all' : 'in_stock',
    limit: '20',
  };
  return useQuery({
    queryKey: queryKeys.products.operations.recipeCandidates(params),
    queryFn: () => listRecipeComponentCandidates({
      search: normalized,
      includeOutOfStock,
    }),
    enabled: enabled && normalized.length >= 2,
  });
}

export function useSaveProductInventoryMatching() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveProductInventoryMatching,
    // Options save one by one, so a failure can follow saved options: refresh either way.
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.channelProductMappings.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuAvailability.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
    ]),
  });
}

export type ChannelCatalogImportSource = 'wing' | 'rocket';

type ChannelCatalogImportResponse =
  | WingCatalogWorkbookUpload
  | RocketMatchingCsvUpload;

export function useImportChannelCatalog() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      source: ChannelCatalogImportSource;
      channelAccountId: string;
      file: File;
    }): Promise<{
      response: ChannelCatalogImportResponse;
      automaticMatching: CatalogAutomaticMatchingResult;
    }> => {
      const response = input.source === 'wing'
        ? await importCoupangWingCatalog(input.channelAccountId, input.file)
        : await importCoupangRocketMatchingCsv(input.channelAccountId, input.file);
      return {
        response,
        automaticMatching: await collectAndAutoConfigureChannel(
          input.channelAccountId,
          { organizationId: user?.organizationId ?? '' },
        ),
      };
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.channelProductMappings.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuAvailability.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
    ]),
  });
}

export type CatalogAutomaticMatchingResult = {
  collectedAliases: number;
  evaluatedListings: number;
  matchedListings: number;
  configuredOptions: number;
  error: string | null;
};

async function collectAndAutoConfigureChannel(
  channelAccountId: string,
  scope: { organizationId: string },
): Promise<CatalogAutomaticMatchingResult> {
  let collected: Awaited<ReturnType<typeof collectSellpiaManualMatchSnapshot>> | null = null;
  try {
    collected = await collectSellpiaManualMatchSnapshot(scope);
    const matched = await autoMatchChannelProducts(channelAccountId);
    return {
      collectedAliases: collected.status.aliasCount,
      ...matched,
      error: null,
    };
  } catch (error) {
    return {
      collectedAliases: 0,
      evaluatedListings: 0,
      matchedListings: 0,
      configuredOptions: 0,
      error: matchingErrorMessage(error),
    };
  }
}

function matchingErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'Sellpia 자동 재고 연결을 완료하지 못했습니다.';
}
