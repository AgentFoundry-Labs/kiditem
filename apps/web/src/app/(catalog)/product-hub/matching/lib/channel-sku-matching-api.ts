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
import { RocketMatchingCsvResultSchema, type RocketMatchingCsvResult } from '@kiditem/shared/channels-operations';
import { OperationFinishResponseSchema } from '@kiditem/shared/operation';
import {
  SellpiaManualMatchAttemptSchema,
  SellpiaManualMatchSourceStatusSchema,
  SellpiaManualMatchTargetsResponseSchema,
  type SellpiaManualMatchAttempt,
  type SellpiaManualMatchSourceStatus,
  type SellpiaManualMatchTargetsResponse,
} from '@kiditem/shared/sellpia-manual-match';
import {
  uploadWingCatalogWorkbook,
  type WingCatalogWorkbookUpload,
} from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/wing-catalog-collection';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
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
  options: Array<{ channelListingOptionId: string } & ReplaceChannelOptionInventoryInput>;
};


export async function saveProductInventoryMatching(
  input: ProductInventoryMatchingSaveInput,
): Promise<void> {
  for (const option of [...input.options].sort((left, right) =>
    left.channelListingOptionId.localeCompare(right.channelListingOptionId))) {
    await apiClient.put(
      `/api/channels/options/${encodeURIComponent(option.channelListingOptionId)}/inventory-components`,
      { expectedComponents: option.expectedComponents, components: option.components },
    );
  }
}

/** [쿠팡상품정보] 엑셀 = `channels.wing_catalog_excel` 실행 하나(KID-351). 등록상품 화면과 같은 업로드다. */
export function importCoupangWingCatalog(
  channelAccountId: string,
  file: File,
): Promise<WingCatalogWorkbookUpload> {
  return uploadWingCatalogWorkbook(channelAccountId, file);
}

export type RocketMatchingCsvUpload = Readonly<{
  /** 같은 파일을 이 계정에 이미 반영했다 — 서버가 다시 쓰지 않았다. */
  duplicate: boolean;
  operationId: string | null;
  changes: RocketMatchingCsvResult;
}>;

const NO_ROCKET_CSV_CHANGES: RocketMatchingCsvResult = {
  rowCount: 0,
  createdProductCount: 0,
  updatedProductCount: 0,
  createdSkuCount: 0,
  updatedSkuCount: 0,
};

/**
 * 로켓-셀피아 매칭 CSV 업로드 = `channels.rocket_matching_csv` 실행 하나(KID-363). 응답은 `{ operation }`이고 반영
 * 수는 `operation.result`다. 같은 파일 재업로드는 서버가 거절한다(`DB_CONFLICT file_already_applied`) — 그것을
 * "이미 가져왔다"로 돌려준다.
 */
export async function importCoupangRocketMatchingCsv(
  channelAccountId: string,
  file: File,
): Promise<RocketMatchingCsvUpload> {
  const form = new FormData();
  form.append('file', file);
  try {
    const { operation } = await apiClient.uploadParsed(
      `/api/channels/accounts/${encodeURIComponent(channelAccountId)}/catalog-imports/coupang-rocket-matching`,
      OperationFinishResponseSchema,
      form,
    );
    return { duplicate: false, operationId: operation.id, changes: RocketMatchingCsvResultSchema.parse(operation.result) };
  } catch (error) {
    if (isApiError(error) && error.code === 'DB_CONFLICT' && error.details.reason === 'file_already_applied') {
      return { duplicate: true, operationId: null, changes: NO_ROCKET_CSV_CHANGES };
    }
    throw error;
  }
}
