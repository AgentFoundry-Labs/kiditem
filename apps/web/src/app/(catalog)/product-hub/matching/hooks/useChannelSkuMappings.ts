'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { issueBrowserCollectionRunId } from '@/lib/browser-collection-session';
import {
  autoMatchChannelProducts,
  getSellpiaManualMatchTargets,
  importCoupangRocketMatchingCsv,
  importCoupangWingCatalog,
  importSellpiaManualMatchSnapshot,
  listChannelAccounts,
  listChannelProductMappings,
  listRecipeComponentCandidates,
  saveProductInventoryMatching,
} from '../lib/channel-sku-matching-api';
import {
  collectSellpiaManualMatchSnapshot,
  finalizeSellpiaManualMatchCollection,
} from '../lib/sellpia-manual-match-collection';
import type {
  CoupangRocketMatchingCsvImportResponse,
  CoupangWingCatalogImportResponse,
} from '@kiditem/shared/source-import';

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
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.channelProductMappings.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuAvailability.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
    ]),
  });
}

export type ChannelCatalogImportSource = 'wing' | 'rocket';

type ChannelCatalogImportResponse =
  | CoupangWingCatalogImportResponse
  | CoupangRocketMatchingCsvImportResponse;

export function useImportChannelCatalog() {
  const queryClient = useQueryClient();
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
        automaticMatching: await collectAndAutoConfigureChannel(input.channelAccountId),
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
): Promise<CatalogAutomaticMatchingResult> {
  let collected: Awaited<ReturnType<typeof collectSellpiaManualMatchSnapshot>> | null = null;
  try {
    const targets = await getSellpiaManualMatchTargets();
    const runId = await issueBrowserCollectionRunId();
    collected = await collectSellpiaManualMatchSnapshot(runId, targets.targetCodes);
    let imported;
    try {
      imported = await importSellpiaManualMatchSnapshot(collected.snapshot);
    } catch (error) {
      await finalizeSellpiaManualMatchCollection(
        collected,
        'failed',
        matchingErrorMessage(error),
      ).catch(() => undefined);
      throw error;
    }
    await finalizeSellpiaManualMatchCollection(
      collected,
      'succeeded',
      `Sellpia 수동상품매칭 별칭 ${imported.status.aliasCount}개를 저장했습니다.`,
    ).catch(() => undefined);
    const matched = await autoMatchChannelProducts(channelAccountId);
    return {
      collectedAliases: imported.status.aliasCount,
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
