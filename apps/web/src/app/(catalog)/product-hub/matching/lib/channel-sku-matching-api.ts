import { z } from 'zod';
import { ChannelAccountListItemSchema, type ChannelAccountListItem } from '@kiditem/shared/channel-account';
import {
  ChannelProductAutoMatchResponseSchema,
  ChannelProductCandidateListResponseSchema,
  ChannelProductMatchingQueueResponseSchema,
  LinkChannelListingProductInputSchema,
  type ChannelProductAutoMatchResponse,
  type ChannelProductCandidateListResponse,
  type ChannelProductMatchingQueueResponse,
  type LinkChannelListingProductInput,
} from '@kiditem/shared/channel-product-matching';
import { CoupangWingCatalogImportResponseSchema, type CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';
import {
  SellpiaManualMatchImportResponseSchema,
  SellpiaManualMatchSnapshotSchema,
  SellpiaManualMatchTargetsResponseSchema,
  type SellpiaManualMatchImportResponse,
  type SellpiaManualMatchSnapshot,
  type SellpiaManualMatchTargetsResponse,
} from '@kiditem/shared/sellpia-manual-match';
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

export function getSellpiaManualMatchTargets(): Promise<SellpiaManualMatchTargetsResponse> {
  return apiClient.getParsed(
    '/api/channels/product-mappings/sellpia-manual-match/targets',
    SellpiaManualMatchTargetsResponseSchema,
  );
}

export async function importSellpiaManualMatchSnapshot(
  snapshot: SellpiaManualMatchSnapshot,
): Promise<SellpiaManualMatchImportResponse> {
  const response = await apiClient.post<unknown>(
    '/api/channels/product-mappings/sellpia-manual-match/import',
    SellpiaManualMatchSnapshotSchema.parse(snapshot),
  );
  return SellpiaManualMatchImportResponseSchema.parse(response);
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

export async function linkChannelListingProduct(
  channelListingId: string,
  input: LinkChannelListingProductInput,
): Promise<void> {
  const body = LinkChannelListingProductInputSchema.parse(input);
  await apiClient.put<void>(
    `/api/channels/product-mappings/${encodeURIComponent(channelListingId)}/master-product`,
    body,
  );
}

export async function autoMatchChannelProducts(
  channelAccountId?: string,
): Promise<ChannelProductAutoMatchResponse> {
  const response = await apiClient.post<unknown>(
    '/api/channels/product-mappings/auto-match',
    channelAccountId ? { channelAccountId } : {},
  );
  return ChannelProductAutoMatchResponseSchema.parse(response);
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
