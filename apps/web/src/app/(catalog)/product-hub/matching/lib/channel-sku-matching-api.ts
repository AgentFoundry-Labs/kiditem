import { z } from 'zod';
import { ChannelAccountListItemSchema, type ChannelAccountListItem } from '@kiditem/shared/channel-account';
import {
  ChannelProductAutoMatchResponseSchema,
  ChannelProductMatchingQueueResponseSchema,
  type ChannelProductAutoMatchResponse,
  type ChannelProductMatchingQueueResponse,
} from '@kiditem/shared/channel-product-matching';
import {
  ProductRecipeComponentCandidateListResponseSchema,
  type ProductRecipeComponentCandidateListResponse,
  type ReplaceChannelOptionInventoryInput,
} from '@kiditem/shared/product-operations';
import {
  CoupangRocketMatchingCsvImportResponseSchema,
  CoupangWingCatalogImportResponseSchema,
  type CoupangRocketMatchingCsvImportResponse,
  type CoupangWingCatalogImportResponse,
} from '@kiditem/shared/source-import';
import {
  SellpiaManualMatchAttemptSchema,
  SellpiaManualMatchSourceStatusSchema,
  SellpiaManualMatchTargetsResponseSchema,
  type SellpiaManualMatchAttempt,
  type SellpiaManualMatchSourceStatus,
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

export type SellpiaManualMatchSourceAttempt = SellpiaManualMatchAttempt;

export function beginSellpiaManualMatchSourceAttempt(input: {
  idempotencyKey: string;
}): Promise<SellpiaManualMatchSourceAttempt> {
  return apiClient
    .post<unknown>(
      '/api/channels/product-mappings/sellpia-manual-match/attempts',
      {},
      { headers: { 'Idempotency-Key': input.idempotencyKey } },
    )
    .then((raw) => SellpiaManualMatchAttemptSchema.parse(raw));
}

export function readSellpiaManualMatchSourceAttempt(
  attemptId: string,
): Promise<SellpiaManualMatchSourceAttempt> {
  return apiClient.getParsed(
    `/api/channels/product-mappings/sellpia-manual-match/attempts/${encodeURIComponent(attemptId)}`,
    SellpiaManualMatchAttemptSchema,
  );
}

export function readSellpiaManualMatchSourceCurrent(): Promise<SellpiaManualMatchSourceStatus> {
  return apiClient.getParsed(
    '/api/channels/product-mappings/sellpia-manual-match/attempts/current',
    SellpiaManualMatchSourceStatusSchema,
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

export function listRecipeComponentCandidates(input: {
  search: string;
  includeOutOfStock: boolean;
}): Promise<ProductRecipeComponentCandidateListResponse> {
  const query = new URLSearchParams({
    search: input.search.trim(),
    limit: '20',
    stockStatus: input.includeOutOfStock ? 'all' : 'in_stock',
  });
  return apiClient.getParsed(
    `/api/products/recipe-component-candidates?${query.toString()}`,
    ProductRecipeComponentCandidateListResponseSchema,
  );
}

export type ProductInventoryMatchingSaveInput = {
  channelListingId: string;
  options: Array<{
    channelListingOptionId: string;
    components: ReplaceChannelOptionInventoryInput['components'];
  }>;
};

export async function saveProductInventoryMatching(
  input: ProductInventoryMatchingSaveInput,
): Promise<void> {
  for (const option of [...input.options].sort((left, right) =>
    left.channelListingOptionId.localeCompare(right.channelListingOptionId))) {
    await apiClient.put(
      `/api/products/channel-options/${encodeURIComponent(option.channelListingOptionId)}/inventory-components`,
      { components: option.components },
    );
  }
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

export function importCoupangRocketMatchingCsv(
  channelAccountId: string,
  file: File,
): Promise<CoupangRocketMatchingCsvImportResponse> {
  const form = new FormData();
  form.append('file', file);
  return apiClient.uploadParsed(
    `/api/channels/accounts/${encodeURIComponent(channelAccountId)}/catalog-imports/coupang-rocket-matching`,
    CoupangRocketMatchingCsvImportResponseSchema,
    form,
  );
}
