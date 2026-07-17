import { z } from 'zod';
import { ChannelAccountListItemSchema, type ChannelAccountListItem } from '@kiditem/shared/channel-account';
import {
  ChannelOptionMatchingQueueRowSchema,
  ChannelRecipeSuggestionResponseSchema,
  ChannelProductCandidateListResponseSchema,
  ChannelProductMatchingQueueResponseSchema,
  ChannelProductMatchingQueueRowSchema,
  ChannelVariantCandidateListResponseSchema,
  LinkChannelListingOptionInputSchema,
  LinkChannelListingProductInputSchema,
  type ChannelOptionMatchingQueueRow,
  type ChannelRecipeSuggestionResponse,
  type ChannelProductCandidateListResponse,
  type ChannelProductMatchingQueueResponse,
  type ChannelProductMatchingQueueRow,
  type ChannelVariantCandidateListResponse,
  type LinkChannelListingOptionInput,
  type LinkChannelListingProductInput,
} from '@kiditem/shared/channel-product-matching';
import { CoupangWingCatalogImportResponseSchema, type CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';
import { apiClient } from '@/lib/api-client';

const ChannelAccountListSchema = z.array(ChannelAccountListItemSchema);

export function listChannelAccounts(): Promise<ChannelAccountListItem[]> {
  return apiClient.getParsed('/api/channels/accounts', ChannelAccountListSchema);
}

export function listChannelProductMappings(params: {
  channelAccountId?: string;
  search?: string;
}): Promise<ChannelProductMatchingQueueResponse> {
  const query = new URLSearchParams();
  if (params.channelAccountId) query.set('channelAccountId', params.channelAccountId);
  if (params.search?.trim()) query.set('search', params.search.trim());
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return apiClient.getParsed(
    `/api/channels/product-mappings${suffix}`,
    ChannelProductMatchingQueueResponseSchema,
  );
}

export function listChannelProductCandidates(
  channelListingId: string,
  search = '',
): Promise<ChannelProductCandidateListResponse> {
  return apiClient.getParsed(
    candidateUrl(`/api/channels/product-mappings/${encodeURIComponent(channelListingId)}/candidates`, search),
    ChannelProductCandidateListResponseSchema,
  );
}

export function listChannelVariantCandidates(
  channelListingOptionId: string,
  search = '',
): Promise<ChannelVariantCandidateListResponse> {
  return apiClient.getParsed(
    candidateUrl(`/api/channels/product-mappings/options/${encodeURIComponent(channelListingOptionId)}/candidates`, search),
    ChannelVariantCandidateListResponseSchema,
  );
}

export function getChannelRecipeSuggestion(
  channelListingOptionId: string,
): Promise<ChannelRecipeSuggestionResponse> {
  return apiClient.getParsed(
    `/api/channels/product-mappings/options/${encodeURIComponent(channelListingOptionId)}/recipe-suggestions`,
    ChannelRecipeSuggestionResponseSchema,
  );
}

export async function linkChannelListingProduct(
  channelListingId: string,
  input: LinkChannelListingProductInput,
): Promise<ChannelProductMatchingQueueRow> {
  const body = LinkChannelListingProductInputSchema.parse(input);
  const response = await apiClient.put<unknown>(
    `/api/channels/product-mappings/${encodeURIComponent(channelListingId)}/master-product`,
    body,
  );
  return ChannelProductMatchingQueueRowSchema.parse(response);
}

export async function linkChannelListingOption(
  channelListingOptionId: string,
  input: LinkChannelListingOptionInput,
): Promise<ChannelOptionMatchingQueueRow> {
  const body = LinkChannelListingOptionInputSchema.parse(input);
  const response = await apiClient.put<unknown>(
    `/api/channels/product-mappings/options/${encodeURIComponent(channelListingOptionId)}/product-variant`,
    body,
  );
  return ChannelOptionMatchingQueueRowSchema.parse(response);
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

function candidateUrl(base: string, search: string): string {
  const normalized = search.trim();
  return normalized ? `${base}?search=${encodeURIComponent(normalized)}` : base;
}
