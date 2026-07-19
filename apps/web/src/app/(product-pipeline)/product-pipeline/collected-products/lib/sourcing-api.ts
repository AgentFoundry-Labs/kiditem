import { apiClient } from '@/lib/api-client';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';
import {
  CreateProductPreparationInputSchema,
  ProductPreparationCommandResultSchema,
  ProductPreparationStatusSchema,
  SourcingCandidateStatusSchema,
  type CreateProductPreparationInput,
  type ProductPreparationCommandResult,
  type ProductPreparationProjection,
  type SourcingCandidateStatus,
} from '@kiditem/shared/sourcing';

export type ProductStatus = SourcingCandidateStatus;

export const isInProgress = (s: string | undefined | null): boolean =>
  s === 'pending' || s === 'processing';

export interface SourcedProduct {
  id: string;
  organizationId?: string;
  name: string;
  status: ProductStatus;
  sourcePlatform: string;
  source_platform: string;
  sourceUrl: string | null;
  source_url: string | null;
  thumbnailUrl: string | null;
  thumbnail_url: string | null;
  imageUrl?: string | null;
  images?: Array<{ id?: string; url: string; sortOrder?: number | null; isPrimary?: boolean | null }>;
  productPreparation?: ProductPreparationSelection | null;
  /**
   * 저장된 대표 썸네일. 서버가 준비(ProductPreparation) → 후보 워크스페이스
   * 순으로 계산해 내려준다. 없으면 `null` 이고 카드는 수집 원본으로 떨어진다.
   */
  selectedThumbnailUrl?: string | null;
  thumbnailPreviewUrls?: string[];
  rejectedAt?: string | null;
  rejectedReason?: string | null;
  triggeredByUserId?: string | null;
  price_krw: number | null;
  cost_cny: number | null;
  image_count: number;
  is_processed: boolean;
  created_at: string;
  updated_at: string;
}

interface ProductListResponse {
  items: SourcedProduct[];
  total: number;
}

export type SourcingSort = 'newest' | 'oldest' | 'name_asc';

interface ThumbnailGenerationListResponse {
  items: ThumbnailGenerationItem[];
  total: number;
}

export interface ProductDetailResponse {
  id: string;
  name: string;
  status: ProductStatus;
  sourcePlatform: string;
  source_platform: string;
  source_url: string | null;
  thumbnailUrl: string | null;
  thumbnail_url: string | null;
  price_krw: number | null;
  cost_cny: number | null;
  image_count: number;
  is_processed: boolean;
  raw_data: Record<string, unknown> | null;
  processed_data: Record<string, unknown> | null;
  image_urls: string[];
  images: Array<{ id?: string; url: string; sortOrder?: number | null; isPrimary?: boolean | null }>;
  basicInfo: ProductBasics;
  productPreparation: ProductPreparationSelection | null;
  /**
   * 후보가 이미 소유한 `ContentWorkspace.id`. 아직 없으면 `null`.
   *
   * `ProductPreparation` 이 없는 후보는 이 값이 썸네일 구성을 저장할 수 있는
   * 유일한 위치다(= `ContentAsset role='thumbnail'` 갤러리 소유자).
   * 구버전 응답에는 없을 수 있어 `null` 로 정규화한다.
   */
  contentWorkspaceId: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegistrationImages {
  primary: string[];
  thumbnail: string[];
  detail: string[];
}

/** 서버 `ProductBasics.salePriceSource` 와 같은 값 집합이다. */
export type SalePriceSource = 'input' | 'sellpia' | 'none';

export interface ProductBasics {
  name: string;
  category: string;
  description: string;
  target: string;
  ageGroup: string;
  tags: string[];
  keywords: string[];
  optionNames: string[];
  kcCertificationStatus: string;
  kcCertificationNumber: string;
  kcCertificationImageUrl: string;
  productSize: string;
  colorVariantStatus: string;
  colorVariantNames: string;
  boxSetStatus: string;
  boxSetQuantity: string;
  originalPrice: number;
  salePrice: number;
  /**
   * `salePrice` 출처. 서버 파생 값이라 읽기 전용이다(수정 API 로 보내지 않는다).
   *   - `input`:   수기 입력값
   *   - `sellpia`: 이름이 정확히 일치한 셀피아 재고 SKU 판매가 폴백
   *   - `none`:    매칭 실패. `salePrice` 는 0이다.
   * 구버전 응답에는 없을 수 있다.
   */
  salePriceSource?: SalePriceSource;
  discountRate: number;
  rocketBundleQuantity: number;
  rocketUnitCost: number;
  thumbnailUrls: string[];
  thumbnailPreviewUrls?: string[];
  /**
   * Channel-registration images split by `ContentAsset.role`. Absent/empty when
   * the candidate has no role-tagged assets. Never contains `role = 'source'`
   * rows — those are raw scrape originals that fail the Coupang 1,000x1,000 spec.
   */
  /** role 별 등록 이미지. 구버전 응답·다른 화면의 로컬 초안에는 없을 수 있다. */
  registrationImages?: RegistrationImages;
  selectedThumbnailUrl: string | null;
  selectedThumbnailGenerationId: string | null;
  selectedThumbnailGenerationCandidateId: string | null;
  selectedDetailPageGenerationId: string | null;
  selectedDetailPageArtifactId: string | null;
  selectedDetailPageRevisionId: string | null;
}

export type UpdateProductBasicsInput = Partial<Pick<
  ProductBasics,
  | 'name'
  | 'category'
  | 'description'
  | 'target'
  | 'ageGroup'
  | 'tags'
  | 'keywords'
  | 'optionNames'
  | 'kcCertificationStatus'
  | 'kcCertificationNumber'
  | 'kcCertificationImageUrl'
  | 'productSize'
  | 'colorVariantStatus'
  | 'colorVariantNames'
  | 'boxSetStatus'
  | 'boxSetQuantity'
  | 'salePrice'
  | 'originalPrice'
  | 'discountRate'
  | 'rocketBundleQuantity'
  | 'rocketUnitCost'
  | 'thumbnailUrls'
>> & {
  basePreparationUpdatedAt?: string | null;
};

export type ProductPreparationSelection = Omit<
  ProductPreparationProjection,
  'updatedAt'
> & {
  updatedAt: string | null;
};

interface StatusResponse {
  id: string;
  status: ProductStatus;
  is_processed: boolean;
  error?: string;
}

export interface ScrapeUrlResponse {
  ok: boolean;
  message: string;
  product_id: string | null;
  skipped?: boolean;
  taskId?: string | null;
  candidateId?: string | null;
  href?: string | null;
}

export type ScrapeUrlStatusResponse =
  | {
      status: 'available';
      candidateId: null;
      href: null;
      platform: '1688' | 'ALIBABA' | null;
    }
  | {
      status: 'collected';
      candidateId: string;
      href: string;
    };

/** Coerces backend Decimal/string `costCny` into a plain number. */
function coerceCostCny(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeImageUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return null;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['url', 'src', 'imageUrl', 'image_url', 'fullPathImageURI', 'fullPathImageUrl']) {
      const url = normalizeImageUrl(obj[key]);
      if (url) return url;
    }
  }
  return null;
}

function collectImageUrls(...sources: unknown[]): string[] {
  const urls: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const url = normalizeImageUrl(value);
    if (url) urls.push(url);
  };
  sources.forEach(visit);
  return [...new Set(urls)];
}

function rawProductImageCandidates(rawData: Record<string, unknown>): string[] {
  return collectImageUrls(
    rawData.images,
    rawData.imageUrls,
    rawData.image_urls,
    rawData.mainImages,
    rawData.main_images,
    rawData.mainImage,
    rawData.main_image,
    rawData.offerImgList,
    rawData.thumbnails,
  );
}

function candidateProductImageUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .filter((img) => {
      if (!img || typeof img !== 'object') return false;
      const role = (img as Record<string, unknown>).role;
      return role == null || role === 'product';
    })
    .map((img) => {
      const url = (img as Record<string, unknown>).url;
      return typeof url === 'string' ? url : null;
    })
    .filter((url): url is string => !!url);
}

function rawDataWithImageFallback(
  rawData: Record<string, unknown>,
  imageUrls: string[],
): Record<string, unknown> {
  if (imageUrls.length === 0 || rawProductImageCandidates(rawData).length > 0) return rawData;
  return {
    ...rawData,
    images: imageUrls,
    imageUrls,
    image_urls: imageUrls,
  };
}

function normalizeProductPreparation(value: unknown): ProductPreparationSelection | null {
  if (!value || typeof value !== 'object') return null;
  const prep = value as Record<string, unknown>;
  const id = typeof prep.id === 'string' ? prep.id : null;
  if (!id) return null;
  return {
    id,
    sourceCandidateId: typeof prep.sourceCandidateId === 'string' ? prep.sourceCandidateId : null,
    channelAccountId: typeof prep.channelAccountId === 'string' ? prep.channelAccountId : null,
    sourceContentWorkspaceId: typeof prep.sourceContentWorkspaceId === 'string'
      ? prep.sourceContentWorkspaceId
      : typeof prep.contentWorkspaceId === 'string'
        ? prep.contentWorkspaceId
        : null,
    channelListingId: typeof prep.channelListingId === 'string'
      ? prep.channelListingId
      : typeof prep.listingId === 'string'
        ? prep.listingId
        : null,
    status: ProductPreparationStatusSchema.parse(prep.status),
    selectedThumbnailUrl: normalizeImageUrl(prep.selectedThumbnailUrl),
    selectedThumbnailGenerationId: typeof prep.selectedThumbnailGenerationId === 'string'
      ? prep.selectedThumbnailGenerationId
      : null,
    selectedThumbnailGenerationCandidateId: typeof prep.selectedThumbnailGenerationCandidateId === 'string'
      ? prep.selectedThumbnailGenerationCandidateId
      : null,
    selectedDetailPageGenerationId: typeof prep.selectedDetailPageGenerationId === 'string'
      ? prep.selectedDetailPageGenerationId
      : null,
    selectedDetailPageArtifactId: typeof prep.selectedDetailPageArtifactId === 'string'
      ? prep.selectedDetailPageArtifactId
      : null,
    selectedDetailPageRevisionId: typeof prep.selectedDetailPageRevisionId === 'string'
      ? prep.selectedDetailPageRevisionId
      : null,
    updatedAt: typeof prep.updatedAt === 'string' ? prep.updatedAt : null,
  };
}

function normalizeRegistrationImages(value: unknown): RegistrationImages {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    primary: collectImageUrls(raw.primary),
    thumbnail: collectImageUrls(raw.thumbnail),
    detail: collectImageUrls(raw.detail),
  };
}

const SALE_PRICE_SOURCES: readonly SalePriceSource[] = ['input', 'sellpia', 'none'];

/** 서버가 값을 안 줬거나 모르는 값이면 출처 미상 → `none`. 추측하지 않는다. */
function normalizeSalePriceSource(value: unknown): SalePriceSource {
  return SALE_PRICE_SOURCES.includes(value as SalePriceSource)
    ? (value as SalePriceSource)
    : 'none';
}

function normalizeProductBasics(
  value: unknown,
  fallback: {
    name: string;
    category: string;
    description?: string | null;
    tags?: string[];
    thumbnailUrls: string[];
    preparation: ProductPreparationSelection | null;
  },
): ProductBasics {
  const basics = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const tags = Array.isArray(basics.tags)
    ? basics.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '')
    : fallback.tags ?? [];
  const keywords = Array.isArray(basics.keywords)
    ? basics.keywords.filter((keyword): keyword is string => typeof keyword === 'string' && keyword.trim() !== '')
    : [];
  const optionNames = Array.isArray(basics.optionNames)
    ? basics.optionNames.filter((option): option is string => typeof option === 'string' && option.trim() !== '')
    : [];
  const explicitThumbnailUrls = collectImageUrls(basics.thumbnailPreviewUrls);
  const thumbnailUrls = collectImageUrls(basics.thumbnailUrls, fallback.thumbnailUrls);
  const numberOrZero = (item: unknown) => typeof item === 'number' && Number.isFinite(item) ? item : 0;
  return {
    name: typeof basics.name === 'string' && basics.name.trim() ? basics.name.trim() : fallback.name,
    category: typeof basics.category === 'string' && basics.category.trim() ? basics.category.trim() : fallback.category,
    description: typeof basics.description === 'string' ? basics.description : fallback.description ?? '',
    target: typeof basics.target === 'string' ? basics.target : '',
    ageGroup: typeof basics.ageGroup === 'string' ? basics.ageGroup : '',
    tags,
    keywords,
    optionNames,
    kcCertificationStatus: typeof basics.kcCertificationStatus === 'string' ? basics.kcCertificationStatus : '',
    kcCertificationNumber: typeof basics.kcCertificationNumber === 'string' ? basics.kcCertificationNumber : '',
    kcCertificationImageUrl: typeof basics.kcCertificationImageUrl === 'string' ? basics.kcCertificationImageUrl : '',
    productSize: typeof basics.productSize === 'string' ? basics.productSize : '',
    colorVariantStatus: typeof basics.colorVariantStatus === 'string' ? basics.colorVariantStatus : '',
    colorVariantNames: typeof basics.colorVariantNames === 'string' ? basics.colorVariantNames : '',
    boxSetStatus: typeof basics.boxSetStatus === 'string' ? basics.boxSetStatus : '',
    boxSetQuantity: typeof basics.boxSetQuantity === 'string' ? basics.boxSetQuantity : '',
    originalPrice: numberOrZero(basics.originalPrice),
    salePrice: numberOrZero(basics.salePrice),
    salePriceSource: normalizeSalePriceSource(basics.salePriceSource),
    discountRate: numberOrZero(basics.discountRate),
    rocketBundleQuantity: numberOrZero(basics.rocketBundleQuantity),
    rocketUnitCost: numberOrZero(basics.rocketUnitCost),
    thumbnailUrls,
    thumbnailPreviewUrls: explicitThumbnailUrls,
    registrationImages: normalizeRegistrationImages(basics.registrationImages),
    selectedThumbnailUrl: normalizeImageUrl(basics.selectedThumbnailUrl) ?? fallback.preparation?.selectedThumbnailUrl ?? null,
    selectedThumbnailGenerationId:
      typeof basics.selectedThumbnailGenerationId === 'string'
        ? basics.selectedThumbnailGenerationId
        : fallback.preparation?.selectedThumbnailGenerationId ?? null,
    selectedThumbnailGenerationCandidateId:
      typeof basics.selectedThumbnailGenerationCandidateId === 'string'
        ? basics.selectedThumbnailGenerationCandidateId
        : fallback.preparation?.selectedThumbnailGenerationCandidateId ?? null,
    selectedDetailPageGenerationId:
      typeof basics.selectedDetailPageGenerationId === 'string'
        ? basics.selectedDetailPageGenerationId
        : fallback.preparation?.selectedDetailPageGenerationId ?? null,
    selectedDetailPageArtifactId:
      typeof basics.selectedDetailPageArtifactId === 'string'
        ? basics.selectedDetailPageArtifactId
        : fallback.preparation?.selectedDetailPageArtifactId ?? null,
    selectedDetailPageRevisionId:
      typeof basics.selectedDetailPageRevisionId === 'string'
        ? basics.selectedDetailPageRevisionId
        : fallback.preparation?.selectedDetailPageRevisionId ?? null,
  };
}

function imageUrlFingerprint(url: string): string {
  try {
    return decodeURIComponent(url).toLowerCase().replace(/[?#].*$/, '');
  } catch {
    return url.toLowerCase().replace(/[?#].*$/, '');
  }
}

function scoreThumbnailCandidate(url: string, index: number, explicitUrl?: string | null): number {
  const fingerprint = imageUrlFingerprint(url);
  let score = 1000 - (index * 12);

  if (explicitUrl && fingerprint === imageUrlFingerprint(explicitUrl)) score += 35;
  if (index > 0 && index <= 4) score += 70;
  if (/thumb|thumbnail|대표|main|cover|hero/.test(fingerprint)) score += 60;
  if (/single|product|item|goods|front|mainimage|standalone/.test(fingerprint)) score += 90;
  if (/detail|desc|description|상세|size|사이즈|spec|스펙/.test(fingerprint)) score -= 180;
  if (/box|package|packaging|carton|박스|상자|포장|barcode|bar_code|바코드|kc|quality|label|warning|safety|품질|표시|인증|주의/.test(fingerprint)) score -= 700;

  return score;
}

export function selectBestThumbnailImage(
  rawData: Record<string, unknown> | null | undefined,
  imageUrls: string[],
  explicitUrl?: string | null,
): string | null {
  const explicit = normalizeImageUrl(explicitUrl);
  if (explicit) return explicit;

  const raw = rawData ?? {};
  const candidates = collectImageUrls(
    raw.representativeImageUrl,
    raw.representative_image_url,
    raw.bestProductImageUrl,
    raw.best_product_image_url,
    raw.primaryProductImageUrl,
    raw.primary_product_image_url,
    raw.mainImage,
    raw.main_image,
    raw.mainImages,
    raw.main_images,
    raw.imageUrl,
    raw.image_url,
    raw.images,
    raw.imageUrls,
    raw.image_urls,
    raw.offerImgList,
    imageUrls,
    explicitUrl,
    raw.thumbnailUrl,
    raw.thumbnail_url,
  );

  if (candidates.length === 0) return null;

  return candidates
    .map((url, index) => ({ url, score: scoreThumbnailCandidate(url, index, explicitUrl) }))
    .sort((a, b) => b.score - a.score)[0]?.url ?? null;
}

export const productsApi = {
  async list(params?: {
    page?: number;
    limit?: number;
    status?: string;
    platform?: string;
    sort?: SourcingSort;
  }): Promise<ProductListResponse> {
    const qs = new URLSearchParams({
      page: String(params?.page || 1),
      limit: String(params?.limit || 50),
    });
    if (params?.platform) qs.set('platform', params.platform);
    if (params?.sort) qs.set('sort', params.sort);
    const data = await apiClient.get<{ items: any[]; total: number; page: number; limit: number }>(`/api/sourcing/extension/products?${qs}`);
    const items: SourcedProduct[] = data.items.map((p: any) => {
      const rawData = (p.rawData as Record<string, unknown>) || {};
      const candidateImageUrls = candidateProductImageUrls(p.images);
      const images = collectImageUrls(
        candidateImageUrls,
        rawProductImageCandidates(rawData),
        p.imageUrl,
        p.thumbnailUrl,
      );
      const productPreparation = normalizeProductPreparation(p.productPreparation);
      const preparationRecord = p.productPreparation && typeof p.productPreparation === 'object'
        ? p.productPreparation as Record<string, unknown>
        : {};
      const registrationInput = preparationRecord.registrationInput &&
        typeof preparationRecord.registrationInput === 'object' &&
        !Array.isArray(preparationRecord.registrationInput)
        ? preparationRecord.registrationInput as Record<string, unknown>
        : {};
      const thumbnailPreviewUrls = collectImageUrls(registrationInput.thumbnailUrls);
      // 서버가 계산한 **저장된 대표 썸네일**(준비 → 후보 워크스페이스 순).
      // 이게 없으면 준비가 없는 후보의 대표 선택이 카드에 반영되지 않고
      // `sourcing_candidates.thumbnail_url`(수집 원본)이 계속 보인다.
      const selectedThumbnailUrl = typeof p.selectedThumbnailUrl === 'string' && p.selectedThumbnailUrl.trim()
        ? p.selectedThumbnailUrl.trim()
        : null;
      const thumbnailUrl = productPreparation?.selectedThumbnailUrl ??
        selectedThumbnailUrl ??
        selectBestThumbnailImage(rawData, images, p.thumbnailUrl || p.imageUrl || null);
      const sourcePlatform = p.sourcePlatform || (rawData.source_platform as string) || '';
      return {
        id: p.id,
        organizationId: p.organizationId,
        name: p.name || rawData.title || '',
        status: SourcingCandidateStatusSchema.parse(p.status),
        sourcePlatform,
        source_platform: sourcePlatform,
        sourceUrl: p.sourceUrl ?? null,
        source_url: p.sourceUrl ?? (rawData.source_url as string) ?? null,
        thumbnailUrl,
        thumbnail_url: thumbnailUrl,
        imageUrl: p.imageUrl ?? null,
        images: Array.isArray(p.images) ? p.images : [],
        productPreparation,
        selectedThumbnailUrl,
        thumbnailPreviewUrls,
        rejectedAt: p.rejectedAt ?? null,
        rejectedReason: p.rejectedReason ?? null,
        triggeredByUserId: p.triggeredByUserId ?? null,
        price_krw: p.sellPrice || null,
        cost_cny: coerceCostCny(p.costCny) ?? (typeof rawData.price === 'string' ? parseFloat(rawData.price) || null : null),
        image_count: images.length,
        is_processed: p.processedData != null,
        created_at: p.createdAt || '',
        updated_at: p.updatedAt || '',
      };
    });
    return { items, total: data.total };
  },

  async getDetail(id: string): Promise<ProductDetailResponse> {
    const p = await apiClient.get<any>(`/api/sourcing/${id}`);
    const rawData = (p.rawData as Record<string, unknown>) || p.raw_data || {};
    const candidateImageUrls = candidateProductImageUrls(p.images);
    const images = collectImageUrls(
      candidateImageUrls,
      rawProductImageCandidates(rawData),
      p.imageUrl,
      p.thumbnailUrl,
    );
    const hydratedRawData = rawDataWithImageFallback(rawData, images);
    const thumbnailUrl = selectBestThumbnailImage(hydratedRawData, images, p.thumbnailUrl || p.imageUrl || null);
    const sourcePlatform = p.sourcePlatform || (rawData.source_platform as string) || '';
    const productPreparation = normalizeProductPreparation(p.productPreparation);
    const basicInfo = normalizeProductBasics(p.basicInfo, {
      name: p.name || rawData.title || '',
      category: p.category || '',
      description: p.description || '',
      tags: Array.isArray(p.tags) ? p.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [],
      thumbnailUrls: images,
      preparation: productPreparation,
    });
    return {
      id: p.id,
      name: p.name || rawData.title || '',
      status: SourcingCandidateStatusSchema.parse(p.status),
      sourcePlatform,
      source_platform: sourcePlatform,
      source_url: p.sourceUrl || rawData.source_url || null,
      thumbnailUrl,
      thumbnail_url: thumbnailUrl,
      price_krw: p.sellPrice || null,
      cost_cny: coerceCostCny(p.costCny) ?? (typeof rawData.price === 'string' ? parseFloat(rawData.price) || null : null),
      image_count: images.length,
      is_processed: p.processedData != null,
      raw_data: hydratedRawData,
      processed_data: p.processedData || p.processed_data || null,
      image_urls: images,
      images: Array.isArray(p.images) ? p.images : [],
      basicInfo,
      productPreparation,
      contentWorkspaceId:
        typeof p.contentWorkspaceId === 'string' && p.contentWorkspaceId
          ? p.contentWorkspaceId
          : null,
      created_at: p.createdAt || '',
      updated_at: p.updatedAt || '',
    };
  },

  async delete(id: string): Promise<{ ok: boolean }> {
    return apiClient.delete<{ ok: boolean }>(`/api/sourcing/candidates/${id}`);
  },

  async process(
    id: string,
    opts?: { generation_mode?: string }
  ): Promise<{ ok: boolean; message: string }> {
    await apiClient.post<{ ok: boolean }>('/api/agent-os/runs', {
      agentType: 'content',
      sourceType: 'sourcing',
      sourceId: id,
      payload: { productId: id, ...(opts || {}) },
    });
    return { ok: true, message: 'AI 가공 작업이 시작되었습니다.' };
  },

  async cancel(id: string): Promise<{ ok: boolean }> {
    return { ok: true };
  },

  async status(id: string): Promise<StatusResponse> {
    const detail = await this.getDetail(id);
    return {
      id: detail.id,
      status: detail.status,
      is_processed: detail.is_processed,
    };
  },

};

export const sourcingApi = {
  async scrapeUrl(url: string): Promise<ScrapeUrlResponse> {
    return apiClient.post<ScrapeUrlResponse>(`/api/sourcing/scrape-url`, { url });
  },
  async scrapeUrlStatus(url: string): Promise<ScrapeUrlStatusResponse> {
    const qs = new URLSearchParams({ url });
    return apiClient.get<ScrapeUrlStatusResponse>(`/api/sourcing/scrape-url/status?${qs}`);
  },
};

export const productThumbnailGenerationApi = {
  async list(params?: { limit?: number }): Promise<ThumbnailGenerationListResponse> {
    const qs = new URLSearchParams({ limit: String(params?.limit ?? 100) });
    return apiClient.get<ThumbnailGenerationListResponse>(`/api/thumbnail-analysis/generations?${qs}`);
  },

  async delete(id: string): Promise<{ ok: true }> {
    return apiClient.delete<{ ok: true }>(`/api/thumbnail-analysis/generations/${encodeURIComponent(id)}`);
  },
};

export type CreatePreparationDraftInput = CreateProductPreparationInput;

export interface CreatePreparationDraftResponse {
  preparationId: string;
  status: 'draft';
}

export interface RejectCandidateResponse {
  ok: true;
}

export interface QuickProcessCandidateResponse {
  ok: true;
  candidateId: string;
  href: string;
  parentOperationKey: string;
  detailGenerationId: string | null;
  thumbnailGenerationId: string | null;
  contentWorkspaceId: string | null;
}

export type QuickProcessTask = 'all' | 'detail' | 'thumbnail';

export const candidatesApi = {
  async createPreparationDraft(
    id: string,
    body: CreatePreparationDraftInput,
  ): Promise<CreatePreparationDraftResponse> {
    const input = CreateProductPreparationInputSchema.parse(body);
    const result = ProductPreparationCommandResultSchema.parse(
      await apiClient.post<unknown>(`/api/sourcing/candidates/${id}/preparations`, input),
    );
    if (result.status !== 'draft' || result.listingId !== undefined) {
      throw new Error('Preparation draft creation returned an invalid result.');
    }
    return { preparationId: result.preparationId, status: result.status };
  },
  quickProcess: (id: string, task: QuickProcessTask = 'all') =>
    apiClient.post<QuickProcessCandidateResponse>(`/api/sourcing/candidates/${id}/quick-process`, { task }),
  updateBasicInfo: (preparationId: string, body: UpdateProductBasicsInput) => {
    const { basePreparationUpdatedAt, ...registrationInput } = body;
    return apiClient.patch<ProductPreparationCommandResult>(
      `/api/sourcing/preparations/${encodeURIComponent(preparationId)}`,
      {
        ...(typeof body.name === 'string' && body.name.trim()
          ? { displayName: body.name.trim() }
          : {}),
        registrationInput,
        ...(basePreparationUpdatedAt !== undefined
          ? { basePreparationUpdatedAt }
          : {}),
      },
    );
  },
  selectThumbnail: (
    preparationId: string,
    body: {
      selectedThumbnailUrl: string;
      selectedThumbnailGenerationId?: string | null;
      selectedThumbnailGenerationCandidateId?: string | null;
    },
  ) =>
    apiClient.patch<ProductPreparationCommandResult>(
      `/api/sourcing/preparations/${encodeURIComponent(preparationId)}`,
      body,
    ),
  selectDetailPage: (
    preparationId: string,
    body: {
      selectedDetailPageGenerationId: string;
      selectedDetailPageArtifactId?: string | null;
      selectedDetailPageRevisionId?: string | null;
    },
  ) =>
    apiClient.patch<ProductPreparationCommandResult>(
      `/api/sourcing/preparations/${encodeURIComponent(preparationId)}`,
      body,
    ),
  reject: (id: string, reason?: string) =>
    apiClient.post<RejectCandidateResponse>(`/api/sourcing/candidates/${id}/reject`, { reason }),
  delete: (id: string) =>
    apiClient.delete<{ ok: true }>(`/api/sourcing/candidates/${id}`),
};
