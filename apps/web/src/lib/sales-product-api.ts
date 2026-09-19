import {
  SabangnetImportPreviewSchema,
  SalesProductExternalImagesSchema,
  SalesProductImageMirrorResultSchema,
  SalesProductListResponseSchema,
  SalesProductMallCategoriesSchema,
  SalesProductSchema,
  type SabangnetImportPreview,
  type SalesProduct,
  type SalesProductExternalImages,
  type SalesProductImageMirrorResult,
  type SalesProductMallCategories,
  type SalesProductChannelOverrideInput,
  type SalesProductListQuery,
  type SalesProductListResponse,
  type SalesProductOptionsReplaceInput,
  type SalesProductUpdateInput,
} from '@kiditem/shared/sales-product';
import {
  ProductRecipeComponentCandidateListResponseSchema,
  type ProductRecipeComponentCandidate,
} from '@kiditem/shared/product-operations';
import { MallChannelOverviewSchema } from '@kiditem/shared/mall-publishing';
import { apiClient } from '@/lib/api-client';

const BASE = '/api/products/sales-products';

/**
 * 판매상품(ADR-0013) 조회 키. 전역 `queryKeys` 가 다른 작업에서 고쳐지는 중이라 이 화면 안에 둔다 —
 * 판매상품을 읽는 곳이 둘이 되면 전역 키로 옮긴다.
 */
export const salesProductKeys = {
  all: ['sales-products'] as const,
  list: (query: Partial<SalesProductListQuery>) => ['sales-products', 'list', query] as const,
  detail: (id: string) => ['sales-products', 'detail', id] as const,
  skuSearch: (search: string) => ['sales-products', 'sku-search', search] as const,
  mallAccounts: () => ['sales-products', 'mall-accounts'] as const,
  externalImages: () => ['sales-products', 'external-images'] as const,
  mallCategories: (mallKey: string) => ['sales-products', 'mall-categories', mallKey] as const,
};

function toQuery(query: Partial<SalesProductListQuery>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const salesProductApi = {
  list: (query: Partial<SalesProductListQuery>): Promise<SalesProductListResponse> =>
    apiClient.getParsed(`${BASE}${toQuery(query)}`, SalesProductListResponseSchema),
  get: (id: string): Promise<SalesProduct> =>
    apiClient.getParsed(`${BASE}/${id}`, SalesProductSchema),
  update: async (id: string, body: SalesProductUpdateInput): Promise<SalesProduct> =>
    SalesProductSchema.parse(await apiClient.patch<unknown>(`${BASE}/${id}`, body)),
  replaceOptions: async (id: string, body: SalesProductOptionsReplaceInput): Promise<SalesProduct> =>
    SalesProductSchema.parse(await apiClient.put<unknown>(`${BASE}/${id}/options`, body)),
  upsertChannelOverride: async (
    id: string,
    channelAccountId: string,
    body: SalesProductChannelOverrideInput,
  ): Promise<SalesProduct> =>
    SalesProductSchema.parse(await apiClient.put<unknown>(`${BASE}/${id}/channel-overrides/${channelAccountId}`, body)),
  deleteChannelOverride: async (id: string, channelAccountId: string): Promise<SalesProduct> =>
    SalesProductSchema.parse(await apiClient.delete<unknown>(`${BASE}/${id}/channel-overrides/${channelAccountId}`)),
  importSabangnet: (files: readonly File[], dryRun: boolean): Promise<SabangnetImportPreview> => {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    return apiClient.uploadParsed(`${BASE}/imports/sabangnet?dryRun=${dryRun}`, SabangnetImportPreviewSchema, form);
  },
  /** 이 몰에서 판매상품이 쓴 사방넷 분류(많이 쓴 순) — 등록 화면 분류 칸의 고를거리. */
  mallCategories: async (mallKey: string): Promise<SalesProductMallCategories> =>
    SalesProductMallCategoriesSchema.parse(
      await apiClient.get<unknown>(`${BASE}/mall-categories?mallKey=${encodeURIComponent(mallKey)}`),
    ),
  /** 사방넷 서버에 남아 있어 옮겨야 하는 사진 수. */
  externalImages: async (): Promise<SalesProductExternalImages> =>
    SalesProductExternalImagesSchema.parse(await apiClient.get<unknown>(`${BASE}/images/external`)),
  /** 사방넷 서버 사진 한 묶음을 우리 저장소로 옮긴다. 다음 묶음은 결과의 `nextSkip` 으로 부른다. */
  mirrorImages: async (skip: number): Promise<SalesProductImageMirrorResult> =>
    SalesProductImageMirrorResultSchema.parse(await apiClient.post<unknown>(`${BASE}/images/mirror?skip=${skip}`)),
  /** 몰별 값을 둘 수 있는 몰 계정 행(ADR-0012). 쇼핑몰 현황과 같은 목록을 읽기만 한다. */
  mallAccounts: async (): Promise<{ channelAccountId: string; mallKey: string; mallName: string }[]> => {
    const overview = MallChannelOverviewSchema.parse(
      await apiClient.get<unknown>('/api/channels/mall-publishing/channel-overview'),
    );
    return overview.channels.flatMap((channel) => channel.channelAccountId
      ? [{ channelAccountId: channel.channelAccountId, mallKey: channel.mallKey, mallName: channel.mallName }]
      : []);
  },
  searchSellpiaSkus: async (search: string): Promise<ProductRecipeComponentCandidate[]> => {
    const params = new URLSearchParams({ search, limit: '20', stockStatus: 'all' });
    const response = await apiClient.getParsed(
      `/api/products/recipe-component-candidates?${params.toString()}`,
      ProductRecipeComponentCandidateListResponseSchema,
    );
    return response.items;
  },
};
