import { z } from 'zod';
import {
  ChannelAccountListItemSchema,
  type ChannelAccountListItem,
} from '@kiditem/shared/channel-account';
import {
  ChannelSkuMappingListItemSchema,
  ChannelSkuMappingListResponseSchema,
  ChannelSkuMatchCandidateListResponseSchema,
  RefreshChannelSkuMappingStatusInputSchema,
  RefreshChannelSkuMappingStatusResponseSchema,
  ReplaceChannelSkuComponentsInputSchema,
  type ChannelSkuMappingListItem,
  type ChannelSkuMappingListResponse,
  type ChannelSkuMappingStatus,
  type ChannelSkuMatchCandidateListResponse,
  type RefreshChannelSkuMappingStatusInput,
  type RefreshChannelSkuMappingStatusResponse,
  type ReplaceChannelSkuComponentsInput,
} from '@kiditem/shared/channel-sku-matching';
import {
  CoupangWingCatalogImportResponseSchema,
  type CoupangWingCatalogImportResponse,
} from '@kiditem/shared/source-import';
import { apiClient } from '@/lib/api-client';

const ChannelAccountListSchema = z.array(ChannelAccountListItemSchema);

export type ChannelSkuMappingListParams = {
  channelAccountId?: string;
  mappingStatus: ChannelSkuMappingStatus | 'all';
  search?: string;
  page: number;
  limit: number;
};

export type ChannelSkuCandidateListParams = {
  search?: string;
};

export function listChannelAccounts(): Promise<ChannelAccountListItem[]> {
  return apiClient.getParsed('/api/channels/accounts', ChannelAccountListSchema);
}

export function listChannelSkuMappings(
  params: ChannelSkuMappingListParams,
): Promise<ChannelSkuMappingListResponse> {
  const query = new URLSearchParams();
  if (params.channelAccountId) {
    query.set('channelAccountId', params.channelAccountId);
  }
  if (params.mappingStatus !== 'all') {
    query.set('mappingStatus', params.mappingStatus);
  }
  const search = params.search?.trim();
  if (search) query.set('search', search);
  query.set('page', String(params.page));
  query.set('limit', String(params.limit));

  return apiClient.getParsed(
    `/api/channels/sku-mappings?${query.toString()}`,
    ChannelSkuMappingListResponseSchema,
  );
}

export async function refreshChannelSkuMappingStatuses(
  input: RefreshChannelSkuMappingStatusInput,
): Promise<RefreshChannelSkuMappingStatusResponse> {
  const parsedInput = RefreshChannelSkuMappingStatusInputSchema.parse(input);
  const response = await apiClient.post<unknown>(
    '/api/channels/sku-mappings/status-refresh',
    parsedInput,
  );
  return RefreshChannelSkuMappingStatusResponseSchema.parse(response);
}

export function listChannelSkuCandidates(
  channelSkuId: string,
  params: ChannelSkuCandidateListParams = {},
): Promise<ChannelSkuMatchCandidateListResponse> {
  const query = new URLSearchParams();
  const search = params.search?.trim();
  if (search) query.set('search', search);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';

  return apiClient.getParsed(
    `/api/channels/sku-mappings/${encodeURIComponent(channelSkuId)}/candidates${suffix}`,
    ChannelSkuMatchCandidateListResponseSchema,
  );
}

export async function replaceChannelSkuComponents(
  channelSkuId: string,
  input: ReplaceChannelSkuComponentsInput,
): Promise<ChannelSkuMappingListItem> {
  const parsedInput = ReplaceChannelSkuComponentsInputSchema.parse(input);
  const response = await apiClient.put<unknown>(
    `/api/channels/sku-mappings/${encodeURIComponent(channelSkuId)}/components`,
    parsedInput,
  );
  return ChannelSkuMappingListItemSchema.parse(response);
}

export function importCoupangWingCatalog(
  channelAccountId: string,
  file: File,
): Promise<CoupangWingCatalogImportResponse> {
  const form = new FormData();
  form.append('file', file);
  return apiClient.uploadParsed(
    `/api/channels/accounts/${encodeURIComponent(channelAccountId)}/catalog-imports/coupang-wing`,
    CoupangWingCatalogImportResponseSchema,
    form,
  );
}
