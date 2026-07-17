'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  importCoupangWingCatalog,
  linkChannelListingOption,
  linkChannelListingProduct,
  listChannelAccounts,
  listChannelProductCandidates,
  listChannelProductMappings,
  listChannelVariantCandidates,
} from '../lib/channel-sku-matching-api';
import type { CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';

export function useChannelAccounts() {
  return useQuery({ queryKey: queryKeys.channelAccounts.active(), queryFn: listChannelAccounts });
}

export function useChannelProductMappings(params: { channelAccountId?: string; search?: string }) {
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
    enabled: Boolean(params.channelAccountId),
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
