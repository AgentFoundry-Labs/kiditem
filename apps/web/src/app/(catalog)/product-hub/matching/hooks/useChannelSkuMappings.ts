'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { issueBrowserCollectionRunId } from '@/lib/browser-collection-session';
import {
  applyChannelRecipeAutomation,
  getSellpiaManualMatchTargets,
  getChannelRecipeAutomationPreview,
  importCoupangWingCatalog,
  importSellpiaManualMatchSnapshot,
  linkChannelListingOption,
  linkChannelListingProduct,
  listChannelAccounts,
  listChannelProductCandidates,
  listChannelProductMappings,
  listChannelVariantCandidates,
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

export function useChannelRecipeAutomationPreviews(channelAccountIds: string[]) {
  const uniqueIds = [...new Set(channelAccountIds)].sort();
  return useQueries({
    queries: uniqueIds.map((channelAccountId) => ({
      queryKey: queryKeys.channelProductMappings.recipeAutomationPreview(
        channelAccountId,
      ),
      queryFn: () => getChannelRecipeAutomationPreview(channelAccountId),
      enabled: Boolean(channelAccountId),
    })),
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

      const result = {
        collectedAliases,
        evaluatedAccounts: uniqueAccountIds.length,
        appliedProducts: 0,
        skippedProducts: 0,
        appliedVariants: 0,
        affectedOptions: 0,
        skippedExistingVariants: 0,
      };
      for (const channelAccountId of uniqueAccountIds) {
        const preview = await getChannelRecipeAutomationPreview(channelAccountId);
        if (preview.summary.autoApply === 0) continue;
        const applied = await applyChannelRecipeAutomation({
          channelAccountId,
          proposalVersion: preview.proposalVersion,
        });
        result.appliedProducts += applied.appliedProducts;
        result.skippedProducts += applied.skippedProducts;
        result.appliedVariants += applied.appliedVariants;
        result.affectedOptions += applied.affectedOptions;
        result.skippedExistingVariants += applied.skippedExistingVariants;
      }
      return result;
    },
    onSettled: (_data, _error, input) => Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.channelProductMappings.sellpiaManualMatchTargets(),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.channelProductMappings.all,
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuAvailability.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      ...[...new Set(input.channelAccountIds)].map((channelAccountId) =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.channelProductMappings.recipeAutomationPreview(
            channelAccountId,
          ),
        })),
    ]),
  });
}

export function useChannelRecipeAutomationPreview(channelAccountId?: string) {
  return useQuery({
    queryKey: queryKeys.channelProductMappings.recipeAutomationPreview(
      channelAccountId ?? '',
    ),
    queryFn: () => getChannelRecipeAutomationPreview(channelAccountId!),
    enabled: Boolean(channelAccountId),
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

export function useChannelVariantCandidates(channelListingOptionId: string | null, search: string, enabled: boolean) {
  const normalized = search.trim();
  return useQuery({
    queryKey: queryKeys.channelProductMappings.variantCandidates(channelListingOptionId ?? '', { search: normalized }),
    queryFn: () => listChannelVariantCandidates(channelListingOptionId ?? '', normalized),
    enabled: enabled && Boolean(channelListingOptionId),
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

export function useLinkChannelListingOption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ channelListingOptionId, productVariantId }: { channelListingOptionId: string; productVariantId: string | null }) =>
      linkChannelListingOption(channelListingOptionId, { productVariantId }),
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
