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
import { apiClient } from '@/lib/api-client';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';

export type ProductStatus = SourcingCandidateStatus;

export interface SellpiaInventorySearchItem {
  masterProductId: string;
  code: string;
  name: string;
  optionName: string | null;
  currentStock: number;
}

export interface ExternalWingSellpiaMatchPreview {
  status: 'matched' | 'selection_required';
  reason: string;
  sellpiaMatch: (SellpiaInventorySearchItem & { quantity: number }) | null;
  proposals: Array<SellpiaInventorySearchItem & { recommendedQuantity: number | null }>;
}

export const isInProgress = (s: string | undefined | null): boolean =>
  s === 'pending' || s === 'processing';

/**
 * 수집후보 하나의 등록 상태. **울타리**(`ProductRegistrationExecution`)가 근거다.
 *
 * 초안 행(`RegistrationTarget.status`)은 거울이라 울타리와 어긋날 수 있다 — 어긋난
 * 거울을 믿으면 이미 마켓에 올라간 상품에 '등록 준비' 버튼이 다시 열린다(ADR-0014).
 */
export type CandidateRegistrationState =
  | 'none'
  | 'preparing'
  | 'confirming'
  | 'failed'
  | 'registered';

const CANDIDATE_REGISTRATION_STATES: readonly CandidateRegistrationState[] = [
  'none',
  'preparing',
  'confirming',
  'failed',
  'registered',
];

/** 서버가 준 등록 상태. 구버전 응답에는 없어서 `null` 로 정규화한다. */
export function normalizeRegistrationState(value: unknown): CandidateRegistrationState | null {
  return CANDIDATE_REGISTRATION_STATES.find((state) => state === value) ?? null;
}

/**
 * 울타리 값이 없는 응답에서만 쓰는 거울 환산.
 *
 * 초안(`draft`)과 취소(`cancelled`)는 아직 아무것도 보내지 않은 것이라 `none` 이다 —
 * 초안이 있다는 사실 자체는 초안 행이 답한다.
 */
export function registrationStateFromPreparation(
  status: ProductPreparationSelection['status'] | null,
): CandidateRegistrationState {
  switch (status) {
    case 'submitting':
      return 'confirming';
    case 'registered':
      return 'registered';
    case 'failed':
      return 'failed';
    default:
      return 'none';
  }
}

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
  registrationTarget?: ProductPreparationSelection | null;
  /** 울타리가 답하는 등록 상태. 구버전 응답에는 없어 `null` 이다. */
  registrationState?: CandidateRegistrationState | null;
  /**
   * 저장된 대표 썸네일. 서버가 준비(RegistrationTarget) → 후보 워크스페이스
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
  registrationTarget: ProductPreparationSelection | null;
  /** 울타리가 답하는 등록 상태. 구버전 응답에는 없어 `null` 이다. */
  registrationState: CandidateRegistrationState | null;
  /**
   * 후보가 이미 소유한 `ContentWorkspace.id`. 아직 없으면 `null`.
   *
   * `RegistrationTarget` 이 없는 후보는 이 값이 썸네일 구성을 저장할 수 있는
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
export type SalePriceSource = 'input' | 'none';

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
   *   - `none`:    입력값 없음. `salePrice` 는 0이다.
   * 구버전 응답에는 없을 수 있다.
   */
  salePriceSource?: SalePriceSource;
  discountRate: number;
  /** 사방넷 신규등록과 같은 칸(상품 등록 초안에서 받는다). 판매상품으로 만들 때 그대로 간다. */
  costPrice?: number;
  brand?: string;
  manufacturer?: string;
  originCountry?: string;
  modelName?: string;
  ownCode?: string;
  /** `taxable` 과세 · `tax_free` 면세. */
  taxType?: string;
  /** 사방넷 `배송비`(VAT 포함)와 `배송비구분`(free · prepay · collect · collect_or_prepay). */
  deliveryFee?: number;
  deliveryFeeType?: string;
  /** 사방넷 인증정보의 인증기관 · 인증분야. */
  certificationIssuer?: string;
  certificationField?: string;
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
  /**
   * 몰별 상품등록 칸 값. `{ 몰키: { 칸키: 값 } }`.
   *
   * 상품 상세에서 한 번 정해 두면 목록 모달에서는 버튼만 누른다. 어느 몰이 어떤
   * 칸을 요구하는지는 `(channels)/_shared/adapters` 가 안다 — 여기 담긴 것은
   * 사람이 고른 값뿐이다.
   */
  mallRegisterValues?: Record<string, Record<string, string>>;
  /**
   * 여러 몰이 함께 쓰는 칸 값(안전인증번호 등). `{ 칸키: 값 }`.
   * 구버전 응답·다른 화면의 로컬 초안에는 없을 수 있다.
   */
  mallRegisterShared?: Record<string, string>;
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
  | 'costPrice'
  | 'brand'
  | 'manufacturer'
  | 'originCountry'
  | 'modelName'
  | 'ownCode'
  | 'taxType'
  | 'deliveryFee'
  | 'deliveryFeeType'
  | 'certificationIssuer'
  | 'certificationField'
  | 'discountRate'
  | 'rocketBundleQuantity'
  | 'rocketUnitCost'
  | 'thumbnailUrls'
  | 'mallRegisterValues'
  | 'mallRegisterShared'
>> & {
  basePreparationUpdatedAt?: string | null;
};

export type ProductPreparationSelection = Omit<
  ProductPreparationProjection,
  'updatedAt'
> & {
  registrationInput: Record<string, unknown>;
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
  attempt: ScrapeUrlAttempt | null;
  candidateId?: string | null;
  href?: string | null;
}

export interface ScrapeUrlAttempt {
  attemptId: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  expiresAt: string;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  scrapeUrlResult?: { candidateId: string; href: string };
}

export interface ScrapeUrlSourceStatus {
  ready: boolean;
  latestAttempt: ScrapeUrlAttempt | null;
  latestComplete: ScrapeUrlAttempt | null;
  actualCutoffAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export type ScrapeUrlStatusResponse = { source: ScrapeUrlSourceStatus } & (
  | {
      status: 'available';
      candidateId: null;
      href: null;
      platform: '1688' | 'alibaba';
    }
  | {
      status: 'collected';
      candidateId: string;
      href: string;
    });

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
  const registrationInput = prep.registrationInput
    && typeof prep.registrationInput === 'object'
    && !Array.isArray(prep.registrationInput)
    ? { ...prep.registrationInput as Record<string, unknown> }
    : {};
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
    registrationInput,
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

const SALE_PRICE_SOURCES: readonly SalePriceSource[] = ['input', 'none'];

/** 서버가 값을 안 줬거나 모르는 값이면 출처 미상 → `none`. 추측하지 않는다. */
function normalizeSalePriceSource(value: unknown): SalePriceSource {
  return SALE_PRICE_SOURCES.includes(value as SalePriceSource)
    ? (value as SalePriceSource)
    : 'none';
}

/** `{ 키: 문자열 }` 만 남긴다. 구버전 응답에는 아예 없을 수 있다. */
function normalizeStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') result[key] = entry;
  }
  return result;
}

/** `{ 몰키: { 칸키: 문자열 } }`. 빈 몰은 담지 않는다. */
function normalizeStringMapMap(value: unknown): Record<string, Record<string, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, Record<string, string>> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const inner = normalizeStringMap(entry);
    if (Object.keys(inner).length > 0) result[key] = inner;
  }
  return result;
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
    // 사방넷 신규등록과 같은 칸. 여기서 빠뜨리면 화면이 값을 들고도 '미입력'으로 보인다.
    costPrice: numberOrZero(basics.costPrice),
    brand: typeof basics.brand === 'string' ? basics.brand : '',
    manufacturer: typeof basics.manufacturer === 'string' ? basics.manufacturer : '',
    originCountry: typeof basics.originCountry === 'string' ? basics.originCountry : '',
    modelName: typeof basics.modelName === 'string' ? basics.modelName : '',
    ownCode: typeof basics.ownCode === 'string' ? basics.ownCode : '',
    taxType: typeof basics.taxType === 'string' ? basics.taxType : '',
    deliveryFee: numberOrZero(basics.deliveryFee),
    deliveryFeeType: typeof basics.deliveryFeeType === 'string' ? basics.deliveryFeeType : '',
    certificationIssuer: typeof basics.certificationIssuer === 'string' ? basics.certificationIssuer : '',
    certificationField: typeof basics.certificationField === 'string' ? basics.certificationField : '',
    thumbnailUrls,
    thumbnailPreviewUrls: explicitThumbnailUrls,
    registrationImages: normalizeRegistrationImages(basics.registrationImages),
    mallRegisterValues: normalizeStringMapMap(basics.mallRegisterValues),
    mallRegisterShared: normalizeStringMap(basics.mallRegisterShared),
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
      const registrationTarget = normalizeProductPreparation(p.registrationTarget);
      const preparationRecord = p.registrationTarget && typeof p.registrationTarget === 'object'
        ? p.registrationTarget as Record<string, unknown>
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
      const thumbnailUrl = registrationTarget?.selectedThumbnailUrl ??
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
        registrationTarget,
        registrationState: normalizeRegistrationState(p.registrationState),
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
    const registrationTarget = normalizeProductPreparation(p.registrationTarget);
    const basicInfo = normalizeProductBasics(p.basicInfo, {
      name: p.name || rawData.title || '',
      category: p.category || '',
      description: p.description || '',
      tags: Array.isArray(p.tags) ? p.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [],
      thumbnailUrls: images,
      preparation: registrationTarget,
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
      registrationTarget,
      registrationState: normalizeRegistrationState(p.registrationState),
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
    await apiClient.post<{ ok: boolean }>(`/api/sourcing/candidates/${id}/quick-process`, {
      task: opts?.generation_mode === 'image' ? 'thumbnail' : opts?.generation_mode === 'draft' ? 'detail' : 'all',
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
  async scrapeUrl(url: string, idempotencyKey: string): Promise<ScrapeUrlResponse> {
    return apiClient.post<ScrapeUrlResponse>(`/api/sourcing/scrape-url`, { url }, { headers: { 'idempotency-key': idempotencyKey } });
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
  quickProcess: (
    id: string,
    task: QuickProcessTask,
    idempotencyKey: string,
  ) =>
    apiClient.post<QuickProcessCandidateResponse>(
      `/api/sourcing/candidates/${id}/quick-process`,
      { task },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    ),
  /**
   * `RegistrationTarget` 이 없는 후보의 기본정보를 후보 자체에 저장한다.
   * 채널 계정 선택 없이도 저장 가능하며, 준비가 생기면 registrationInput 이 이어받는다.
   */
  updateCandidateBasicInfo: (candidateId: string, body: UpdateProductBasicsInput) => {
    const { basePreparationUpdatedAt: _ignored, ...basics } = body;
    return apiClient.patch<{ ok: true }>(
      `/api/sourcing/candidates/${encodeURIComponent(candidateId)}/basic-info`,
      basics,
    );
  },
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

export async function searchSellpiaInventorySkus(
  query: string,
  includeOutOfStock = false,
): Promise<SellpiaInventorySearchItem[]> {
  const params = new URLSearchParams({
    page: '1',
    limit: '20',
    query: query.trim(),
    activeStatus: 'active',
    stockStatus: includeOutOfStock ? 'all' : 'in_stock',
  });
  const response = await apiClient.get<{ items: SellpiaInventorySearchItem[] }>(
    `/api/inventory/sellpia-skus?${params.toString()}`,
  );
  return response.items;
}
