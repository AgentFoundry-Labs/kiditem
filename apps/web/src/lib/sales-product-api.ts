import {
  SabangnetImportPreviewSchema,
  SalesProductExternalImagesSchema,
  SalesProductFromCandidatesResultSchema,
  SalesProductImageMirrorResultSchema,
  SalesProductListResponseSchema,
  SalesProductMallCategoriesSchema,
  SalesProductMallCategoryAssignResultSchema,
  SalesProductMallPriceAdoptionSchema,
  SalesProductMallSheetCheckSchema,
  SalesProductMallSheetListSchema,
  SalesProductPublicImagePendingSchema,
  SalesProductSchema,
  type SabangnetImportPreview,
  type SalesProduct,
  type SalesProductExternalImages,
  type SalesProductFromCandidatesRequest,
  type SalesProductFromCandidatesResult,
  type SalesProductImageMirrorResult,
  type SalesProductMallCategories,
  type SalesProductMallCategoryAssignRequest,
  type SalesProductMallCategoryAssignResult,
  type SalesProductMallPriceAdoption,
  type SalesProductMallSheetCheck,
  type SalesProductMallSheetList,
  type SalesProductPublicImagePending,
  type SalesProductPublicImageSaveRequest,
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
import { ApiError } from '@/lib/api-error';

const BASE = '/api/products/sales-products';

/**
 * 판매상품(ADR-0014) 조회 키. 전역 `queryKeys` 가 다른 작업에서 고쳐지는 중이라 이 화면 안에 둔다 —
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
  mallPriceAdoption: () => ['sales-products', 'mall-price-adoption'] as const,
  mallSheets: () => ['sales-products', 'mall-sheets'] as const,
  publicImages: (salesProductIds: readonly string[]) => ['sales-products', 'public-images', [...salesProductIds].sort()] as const,
};

/** 몰 엑셀 요청 몸통. `salesProductIds` 를 비우면 이 몰에 아직 없는 판매상품을 서버가 고른다(확인만). */
export interface MallSheetRequestBody {
  salesProductIds?: string[];
  fixed: Record<string, string>;
}

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
  /** 몰 가격이 판매상품 기준과 다른 상품 × 몰 — 몰별 값으로 가져오면 바뀔 것(쓰지 않는다). */
  previewMallPriceAdoption: async (): Promise<SalesProductMallPriceAdoption> =>
    SalesProductMallPriceAdoptionSchema.parse(await apiClient.get<unknown>(`${BASE}/mall-prices/adoption`)),
  /** 몰 가격을 몰별 값으로 저장한다. 몰은 건드리지 않는다. */
  applyMallPriceAdoption: async (): Promise<SalesProductMallPriceAdoption> =>
    SalesProductMallPriceAdoptionSchema.parse(await apiClient.post<unknown>(`${BASE}/mall-prices/adoption`)),
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
  /** 몰 대량등록 엑셀 목록 — 몰마다 고정값 칸과 기본값. */
  mallSheets: async (): Promise<SalesProductMallSheetList> =>
    SalesProductMallSheetListSchema.parse(await apiClient.get<unknown>(`${BASE}/mall-sheets`)),
  /** 몰 엑셀에 무엇이 들어가고 무엇이 막히는지(파일은 만들지 않는다). */
  checkMallSheet: async (sheetKey: string, body: MallSheetRequestBody): Promise<SalesProductMallSheetCheck> =>
    SalesProductMallSheetCheckSchema.parse(
      await apiClient.post<unknown>(`${BASE}/mall-sheets/${encodeURIComponent(sheetKey)}/check`, body),
    ),
  /** 고른 판매상품으로 채운 몰 양식 파일(바이트와 파일 이름). 몰에 올리지 않는다. */
  downloadMallSheet: async (
    sheetKey: string,
    body: Required<MallSheetRequestBody>,
  ): Promise<{ blob: Blob; fileName: string }> => {
    const response = await apiClient.fetchRaw(`${BASE}/mall-sheets/${encodeURIComponent(sheetKey)}/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      throw new ApiError(
        response.status,
        typeof payload?.error === 'string' ? payload.error : null,
        typeof payload?.message === 'string' ? payload.message : '몰 엑셀을 만들지 못했습니다.',
      );
    }
    return {
      blob: await response.blob(),
      fileName: fileNameFrom(response.headers.get('Content-Disposition')) ?? `${sheetKey}_대량등록.xlsx`,
    };
  },
  /** 수집상품 화면의 몰 대량등록 — 고른 수집상품을 판매상품으로 만든다(같은 수집상품에서 만든 것은 그대로 쓴다). */
  createFromCandidates: async (body: SalesProductFromCandidatesRequest): Promise<SalesProductFromCandidatesResult> =>
    SalesProductFromCandidatesResultSchema.parse(await apiClient.post<unknown>(`${BASE}/from-candidates`, body)),
  /** 이 판매상품들의 사진 중 몰이 못 읽고(우리 저장소) 공개 주소도 아직 없는 것. */
  pendingPublicImages: async (salesProductIds: string[]): Promise<SalesProductPublicImagePending> =>
    SalesProductPublicImagePendingSchema.parse(
      await apiClient.post<unknown>(`${BASE}/public-images/pending`, { salesProductIds }),
    ),
  /** 확장이 공개 저장소에 올린 사진 주소를 저장한다. 판매상품의 사진 주소는 그대로 둔다. */
  savePublicImages: async (body: SalesProductPublicImageSaveRequest): Promise<{ saved: number }> =>
    apiClient.post<{ saved: number }>(`${BASE}/public-images`, body),
  /** 여러 판매상품의 한 몰 분류를 정한다(몰별 값의 categoryPath). 몰은 건드리지 않는다. */
  assignMallCategory: async (body: SalesProductMallCategoryAssignRequest): Promise<SalesProductMallCategoryAssignResult> =>
    SalesProductMallCategoryAssignResultSchema.parse(await apiClient.post<unknown>(`${BASE}/mall-categories/assign`, body)),
  searchSellpiaSkus: async (search: string): Promise<ProductRecipeComponentCandidate[]> => {
    const params = new URLSearchParams({ search, limit: '20', stockStatus: 'all' });
    const response = await apiClient.getParsed(
      `/api/products/recipe-component-candidates?${params.toString()}`,
      ProductRecipeComponentCandidateListResponseSchema,
    );
    return response.items;
  },
};

function fileNameFrom(disposition: string | null): string | null {
  if (!disposition) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return /filename="([^"]+)"/i.exec(disposition)?.[1] ?? null;
}
