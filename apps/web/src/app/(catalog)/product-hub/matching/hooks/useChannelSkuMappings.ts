'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  ChannelSkuMappingStatus,
  RefreshChannelSkuMappingStatusInput,
  ReplaceChannelSkuComponentsInput,
} from '@kiditem/shared/channel-sku-matching';
import { queryKeys } from '@/lib/query-keys';
import {
  importCoupangWingCatalog,
  listChannelAccounts,
  listChannelSkuCandidates,
  listChannelSkuMappings,
  refreshChannelSkuMappingStatuses,
  replaceChannelSkuComponents,
} from '../lib/channel-sku-matching-api';

type UseChannelSkuMappingsParams = {
  accountMode: 'selected' | 'all';
  channelAccountId?: string;
  mappingStatus: ChannelSkuMappingStatus | 'all';
  search?: string;
  page: number;
  limit: number;
};

type ReplaceChannelSkuComponentsVariables = {
  channelSkuId: string;
  input: ReplaceChannelSkuComponentsInput;
};

type ImportCoupangWingCatalogVariables = {
  channelAccountId: string;
  file: File;
};

export function useChannelAccounts() {
  return useQuery({
    queryKey: queryKeys.channelAccounts.active(),
    queryFn: listChannelAccounts,
  });
}

export function useChannelSkuMappings(params: UseChannelSkuMappingsParams) {
  const search = params.search?.trim() ?? '';
  const keyParams: Record<string, string> = {
    channelAccountId: params.channelAccountId ?? '',
    mappingStatus: params.mappingStatus,
    search,
    page: String(params.page),
    limit: String(params.limit),
  };

  return useQuery({
    queryKey: queryKeys.channelSkuMappings.list(keyParams),
    queryFn: () =>
      listChannelSkuMappings({
        channelAccountId: params.channelAccountId,
        mappingStatus: params.mappingStatus,
        search,
        page: params.page,
        limit: params.limit,
      }),
    enabled: params.accountMode === 'all' || Boolean(params.channelAccountId),
    placeholderData: keepPreviousData,
  });
}

export function useChannelSkuCandidates(
  channelSkuId: string | null,
  search: string,
  enabled: boolean,
) {
  const normalizedSearch = search.trim();
  return useQuery({
    queryKey: queryKeys.channelSkuMappings.candidates(channelSkuId ?? '', {
      search: normalizedSearch,
    }),
    queryFn: () =>
      listChannelSkuCandidates(channelSkuId ?? '', {
        search: normalizedSearch,
      }),
    enabled: enabled && Boolean(channelSkuId),
  });
}

export function useRefreshChannelSkuMappingStatuses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RefreshChannelSkuMappingStatusInput) =>
      refreshChannelSkuMappingStatuses(input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.channelSkuMappings.lists(),
      }),
  });
}

export function useReplaceChannelSkuComponents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ channelSkuId, input }: ReplaceChannelSkuComponentsVariables) =>
      replaceChannelSkuComponents(channelSkuId, input),
    onSuccess: (_data, variables) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.channelSkuMappings.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: [
            ...queryKeys.channelSkuMappings.all,
            'candidates',
            variables.channelSkuId,
          ],
        }),
      ]),
  });
}

export function useImportCoupangWingCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ channelAccountId, file }: ImportCoupangWingCatalogVariables) =>
      importCoupangWingCatalog(channelAccountId, file),
    onSuccess: async (_data, variables) => {
      await refreshChannelSkuMappingStatuses({
        channelAccountId: variables.channelAccountId,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.channelSkuMappings.lists(),
      });
    },
  });
}
