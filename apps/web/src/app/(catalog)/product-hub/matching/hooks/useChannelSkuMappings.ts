'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  importCoupangWingCatalog,
  listChannelAccounts,
  listChannelSkuCandidates,
  listChannelSkuMappings,
  refreshChannelSkuMappingStatuses,
  replaceChannelSkuComponents,
} from '../lib/channel-sku-matching-api';
import type {
  ChannelSkuMappingStatus,
  RefreshChannelSkuMappingStatusInput,
  ReplaceChannelSkuComponentsInput,
} from '@kiditem/shared/channel-sku-matching';
import type { CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';

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

export type CoupangWingCatalogImportOutcome = {
  response: CoupangWingCatalogImportResponse;
  statusRefreshFailed: boolean;
};

const channelSkuCandidateFamilyKey = [
  ...queryKeys.channelSkuMappings.all,
  'candidates',
] as const;

function isStringRecord(value: unknown): value is Record<string, string> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNextPageInSameScope(
  current: Record<string, string>,
  previousQueryKey: readonly unknown[] | undefined,
): boolean {
  const previous = previousQueryKey?.[2];
  if (!isStringRecord(previous) || previous.page === current.page) return false;
  return (
    previous.channelAccountId === current.channelAccountId &&
    previous.mappingStatus === current.mappingStatus &&
    previous.search === current.search &&
    previous.limit === current.limit
  );
}

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
    placeholderData: (previousData, previousQuery) =>
      isNextPageInSameScope(keyParams, previousQuery?.queryKey)
        ? previousData
        : undefined,
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
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useRefreshChannelSkuMappingStatuses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RefreshChannelSkuMappingStatusInput) =>
      refreshChannelSkuMappingStatuses(input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.channelSkuMappings.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: channelSkuCandidateFamilyKey,
        }),
      ]),
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
    mutationFn: async ({
      channelAccountId,
      file,
    }: ImportCoupangWingCatalogVariables): Promise<CoupangWingCatalogImportOutcome> => {
      const response = await importCoupangWingCatalog(channelAccountId, file);
      let statusRefreshFailed = false;
      try {
        await refreshChannelSkuMappingStatuses({ channelAccountId });
      } catch {
        statusRefreshFailed = true;
      } finally {
        await Promise.allSettled([
          queryClient.invalidateQueries({
            queryKey: queryKeys.channelSkuMappings.lists(),
          }),
          queryClient.invalidateQueries({
            queryKey: channelSkuCandidateFamilyKey,
          }),
        ]);
      }
      return { response, statusRefreshFailed };
    },
  });
}
