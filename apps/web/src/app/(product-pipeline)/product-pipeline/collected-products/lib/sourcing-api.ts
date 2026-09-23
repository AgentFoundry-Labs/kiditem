import {
  ProductPreparationStatusSchema,
  SourcingCandidateStatusSchema,
  type ProductPreparationProjection,
  type SourcingCandidateStatus,
} from '@kiditem/shared/sourcing';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { salesProductApi } from '@/lib/sales-product-api';
import {
  contentWorkspacesApi,
  type SalesProductRegistrationMedia,
} from '../../_shared/lib/content-workspaces-api';
import type { SalesProduct, SalesProductUpdateInput } from '@kiditem/shared/sales-product';

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
  /** 이 후보의 판매상품 초안 id. 수집 시점부터 있다(ADR-0022) — 없으면 이관 전 구행이다. */
  salesProductId: string | null;
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

/**
 * 수집상품 화면 하나. `id` 는 판매상품 초안 id 다(KID-310 · ADR-0022) — 원천 기록(수집상품)
 * id 는 `sourceCandidateId` 이고, 원천이 없는 초안이면 `null` 이다.
 */
export interface ProductDetailResponse {
  id: string;
  name: string;
  /** 원천 기록의 소싱 판단(`sourced` · `rejected`). 원천이 없는 초안이면 `null`. */
  status: ProductStatus | null;
  /** 초안을 만든 원천 기록(수집상품) id. 원천 사실을 읽고 원천을 지울 때만 쓴다. */
  sourceCandidateId: string | null;
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
  /**
   * 읽기 전용 basics 투영. 서버는 더 이상 합성 basics 를 주지 않는다 — 이 값은
   * `salesProductId` 로 이어진 판매상품 초안에서 `productBasicsFromSalesProduct` 가
   * 계산한다. 편집은 여기로 보내지 않는다(전부 `salesProductApi.update`/`replaceOptions`).
   */
  basicInfo: ProductBasics;
  registrationTarget: ProductPreparationSelection | null;
  /** 울타리가 답하는 등록 상태. 구버전 응답에는 없어 `null` 이다. */
  registrationState: CandidateRegistrationState | null;
  /** 판매상품 초안 id(= `id`). 등록상품 화면이 리스팅에서 만든 값에는 초안이 없어 `null` 이다. */
  salesProductId: string | null;
  /** 초안의 낙관적 동시성 버전. `salesProductApi.update`/`replaceOptions` 의 `expectedVersion`. */
  salesProductVersion: number | null;
  /** 초안 기준 등록 이미지(role 별). 초안이 없으면 빈 값. */
  registrationImages: RegistrationImages;
  /** 초안이 저장해 둔 대표 썸네일. 초안이 없거나 고른 적이 없으면 `null`. */
  currentThumbnail: SalesProductCurrentThumbnailView | null;
  created_at: string;
  updated_at: string;
}

/** `SalesProductContentAssetPort.SalesProductCurrentThumbnail` 과 같은 모양. */
export interface SalesProductCurrentThumbnailView {
  url: string;
  sourceThumbnailGenerationId: string | null;
  sourceThumbnailCandidateId: string | null;
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

export interface ScrapeUrlResponse {
  ok: boolean;
  message: string;
  product_id: string | null;
  skipped?: boolean;
  attempt: ScrapeUrlAttempt | null;
  candidateId?: string | null;
  salesProductId?: string | null;
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
      salesProductId?: null;
      href: null;
      platform: '1688' | 'alibaba';
    }
  | {
      status: 'collected';
      candidateId: string;
      /** 수집상품 화면이 여는 판매상품 초안. 초안을 아직 못 찾았으면 `null` 이고 주소도 없다. */
      salesProductId: string | null;
      href: string | null;
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

function normalizeCurrentThumbnail(value: unknown): SalesProductCurrentThumbnailView | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const url = normalizeImageUrl(raw.url);
  if (!url) return null;
  return {
    url,
    sourceThumbnailGenerationId: typeof raw.sourceThumbnailGenerationId === 'string' ? raw.sourceThumbnailGenerationId : null,
    sourceThumbnailCandidateId: typeof raw.sourceThumbnailCandidateId === 'string' ? raw.sourceThumbnailCandidateId : null,
  };
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

/**
 * 판매상품 초안 → 읽기 전용 `ProductBasics` 투영.
 *
 * 편집 정본이 판매상품으로 옮겨간 뒤(KID-310 · ADR-0022), 후보 상세는 이 값을 그대로
 * 보여주기만 한다 — WING 등록·몰 중립 초안처럼 아직 `ProductBasics` 모양을 그대로 쓰는
 * 읽기 전용 소비자를 위한 다리다. 저장은 이 값을 거치지 않고 `salesProductApi.update`/
 * `replaceOptions` 로 초안에 직접 간다.
 *
 * 판매가·정상가는 `unused` 가 아닌 옵션 중 가장 싼 값을 쓴다 — 목록 칸(`salePrice`)과
 * 같은 규칙이다. 아직 하나도 가격이 없으면(= draft) 0 이다.
 */
function productBasicsFromSalesProduct(
  product: SalesProduct,
  media: { registrationImages: RegistrationImages; currentThumbnail: SalesProductCurrentThumbnailView | null },
): ProductBasics {
  const sellingOptions = product.options.filter((option) => option.supplyStatus !== 'unused');
  const pricedOptions = sellingOptions.filter(
    (option): option is typeof option & { salePrice: number } => option.salePrice !== null,
  );
  const cheapest = pricedOptions.length > 0
    ? pricedOptions.reduce((min, option) => (option.salePrice < min.salePrice ? option : min))
    : null;
  const certification = product.certifications[0] ?? null;
  const thumbnailUrls = product.imageUrls;
  return {
    name: product.name,
    category: product.standardCategory ?? '',
    description: product.description,
    target: product.targetAudience ?? '',
    ageGroup: product.ageGroup ?? '',
    tags: [],
    keywords: product.keywords,
    optionNames: sellingOptions.length > 1
      ? sellingOptions.map((option) => option.values.join(' / ')).filter(Boolean)
      : [],
    kcCertificationStatus: product.kcStatus === 'unknown' ? '' : product.kcStatus,
    kcCertificationNumber: certification?.number ?? '',
    kcCertificationImageUrl: certification?.imageUrl ?? '',
    productSize: product.productSize ?? '',
    colorVariantStatus: product.colorVariantNames.length > 0 ? 'multiple' : '',
    colorVariantNames: product.colorVariantNames.join(', '),
    boxSetStatus: product.boxSetQuantity ? 'set' : '',
    boxSetQuantity: product.boxSetQuantity != null ? String(product.boxSetQuantity) : '',
    originalPrice: cheapest?.normalPrice ?? 0,
    salePrice: cheapest?.salePrice ?? 0,
    salePriceSource: cheapest ? 'input' : 'none',
    discountRate: 0,
    costPrice: 0,
    brand: product.brand ?? '',
    manufacturer: product.manufacturer ?? '',
    originCountry: product.originCountry ?? '',
    modelName: product.modelName ?? '',
    ownCode: product.ownCode ?? '',
    taxType: product.taxType,
    deliveryFee: product.deliveryFee ?? 0,
    deliveryFeeType: product.deliveryFeeType ?? '',
    certificationIssuer: certification?.issuer ?? '',
    certificationField: certification?.field ?? '',
    rocketBundleQuantity: 0,
    rocketUnitCost: 0,
    thumbnailUrls,
    thumbnailPreviewUrls: thumbnailUrls,
    registrationImages: media.registrationImages,
    // 몰별 값은 이제 등록 대상(RegistrationTarget.registrationInput)에 산다 — 채널 계정이
    // 있어야 읽을 수 있어 여기서는 비워 둔다. 공통값만 판매상품에 남아 있다.
    mallRegisterValues: {},
    mallRegisterShared: normalizeStringMap(product.registrationDefaults),
    selectedThumbnailUrl: media.currentThumbnail?.url ?? thumbnailUrls[0] ?? null,
    selectedThumbnailGenerationId: media.currentThumbnail?.sourceThumbnailGenerationId ?? null,
    selectedThumbnailGenerationCandidateId: media.currentThumbnail?.sourceThumbnailCandidateId ?? null,
    selectedDetailPageGenerationId: null,
    selectedDetailPageArtifactId: null,
    selectedDetailPageRevisionId: null,
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
        salesProductId: typeof p.salesProductId === 'string' && p.salesProductId ? p.salesProductId : null,
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

  /**
   * 수집상품 화면 하나 — 판매상품 초안 id 로 연다(KID-310 · ADR-0022).
   *
   * 편집 정본은 초안이다. 원천 기록(수집상품)은 초안의 `sourceCandidateId` 로만 읽고, 수집 원본
   * 이미지 · 원천 주소 · 원본 데이터 · 원가 같은 원천 사실에만 쓴다. 등록용 사진과 대표 썸네일은
   * 초안의 콘텐츠에서 읽는다.
   */
  async getDetail(salesProductId: string): Promise<ProductDetailResponse> {
    const [{ draft, source }, media] = await Promise.all([
      productsApi.getDraftWithSource(salesProductId),
      contentWorkspacesApi.getRegistrationMedia(salesProductId),
    ]);
    return composeProductDetail(draft, source, media);
  },

  /** 초안과, 초안이 원천 기록을 가리키면 그 원천 기록. 원천이 없는 초안은 후보를 묻지 않는다. */
  async getDraftWithSource(salesProductId: string): Promise<{ draft: SalesProduct; source: unknown | null }> {
    const draft = await salesProductApi.get(salesProductId);
    // 원천 기록은 초안보다 먼저 지워질 수 있다(후보를 지워도 초안은 남는다). 그러면 원천 사실이
    // 없는 초안으로 연다 — 다른 오류는 그대로 올린다.
    const source = draft.sourceCandidateId
      ? await apiClient
        .get<unknown>(`/api/sourcing/${encodeURIComponent(draft.sourceCandidateId)}`)
        .catch((error: unknown) => {
          if (isApiError(error) && error.status === 404) return null;
          throw error;
        })
      : null;
    return { draft, source };
  },
};

/**
 * 초안 + 원천 기록 + 초안의 등록용 사진 → 수집상품 화면 값.
 *
 * `id` 는 초안 id 다. 원천 기록이 없으면(직접 작성 · 사방넷) 원천 사실은 비고, 사진은 초안의
 * 사진이다.
 */
export function composeProductDetail(
  draft: SalesProduct,
  sourceResponse: unknown | null,
  media: SalesProductRegistrationMedia,
): ProductDetailResponse {
  const p = (sourceResponse && typeof sourceResponse === 'object' ? sourceResponse : null) as Record<string, any> | null;
  const rawData = p ? ((p.rawData as Record<string, unknown>) || p.raw_data || {}) : null;
  const images = p
    ? collectImageUrls(
      candidateProductImageUrls(p.images),
      rawProductImageCandidates(rawData ?? {}),
      p.imageUrl,
      p.thumbnailUrl,
    )
    : collectImageUrls(draft.imageUrls);
  const hydratedRawData = rawData ? rawDataWithImageFallback(rawData, images) : null;
  const thumbnailUrl = selectBestThumbnailImage(
    hydratedRawData,
    images,
    p ? (p.thumbnailUrl || p.imageUrl || null) : (draft.imageUrls[0] ?? null),
  );
  const sourcePlatform = draft.sourcePlatform ?? '';
  const registrationImages = normalizeRegistrationImages(media.registrationImages);
  const currentThumbnail = normalizeCurrentThumbnail(media.currentThumbnail);
  // 남은 원천 기록 읽기 — 등록 설정과 울타리 상태는 아직 후보 응답만 준다. pass C 가
  // Channels 읽기(등록 대상 목록 + 울타리 상태)로 바꾼다. 원천이 없는 초안은 없음이다.
  const registrationTarget = p ? normalizeProductPreparation(p.registrationTarget) : null;
  const registrationState = p ? normalizeRegistrationState(p.registrationState) : 'none';
  return {
    id: draft.id,
    name: draft.name,
    status: p ? SourcingCandidateStatusSchema.parse(p.status) : null,
    sourceCandidateId: draft.sourceCandidateId,
    sourcePlatform,
    source_platform: sourcePlatform,
    source_url: draft.sourceUrl ?? (p ? p.sourceUrl || rawData?.source_url || null : null),
    thumbnailUrl,
    thumbnail_url: thumbnailUrl,
    price_krw: p ? p.sellPrice || null : null,
    cost_cny: p
      ? coerceCostCny(p.costCny) ?? (typeof rawData?.price === 'string' ? parseFloat(rawData.price) || null : null)
      : null,
    image_count: images.length,
    is_processed: p ? p.processedData != null : false,
    raw_data: hydratedRawData,
    processed_data: p ? p.processedData || p.processed_data || null : null,
    image_urls: images,
    images: p && Array.isArray(p.images) ? p.images : [],
    basicInfo: productBasicsFromSalesProduct(draft, { registrationImages, currentThumbnail }),
    registrationTarget,
    registrationState,
    salesProductId: draft.id,
    salesProductVersion: draft.version,
    registrationImages,
    currentThumbnail,
    created_at: isoString(draft.createdAt),
    updated_at: isoString(draft.updatedAt),
  };
}

function isoString(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString();
}

export const sourcingApi = {
  async scrapeUrl(url: string, idempotencyKey: string): Promise<ScrapeUrlResponse> {
    return apiClient.post<ScrapeUrlResponse>(`/api/sourcing/scrape-url`, { url }, { headers: { 'idempotency-key': idempotencyKey } });
  },
  async scrapeUrlStatus(url: string): Promise<ScrapeUrlStatusResponse> {
    const qs = new URLSearchParams({ url });
    return apiClient.get<ScrapeUrlStatusResponse>(`/api/sourcing/scrape-url/status?${qs}`);
  },
};

export interface RejectCandidateResponse {
  status: 'rejected';
  /** 반려와 함께 그 판매상품 초안을 내렸는가. */
  draftRetired?: boolean;
  /** 초안을 내리지 못한 이유(몰에 올라가 있다 등). 반려 자체는 막지 않는다. */
  draftWarning?: string;
}

export interface SalesProductGenerationStartResponse {
  ok: true;
  /** 이 초안의 원천 후보. 후보 없이 직접 만든 초안이면 `null`. */
  candidateId: string | null;
  salesProductId: string;
  href: string;
  detailGenerationId: string | null;
  thumbnailGenerationId: string | null;
  contentWorkspaceId: string | null;
}

export type SalesProductGenerationTask = 'all' | 'detail' | 'thumbnail';

/** 판매상품 초안의 콘텐츠 생성(썸네일 · 상세페이지). 대상은 초안이다(KID-310). */
export const salesProductGenerationApi = {
  start: (
    salesProductId: string,
    task: SalesProductGenerationTask,
    idempotencyKey: string,
  ) =>
    apiClient.post<SalesProductGenerationStartResponse>(
      `/api/products/sales-products/${encodeURIComponent(salesProductId)}/generation`,
      { task },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    ),
};

/** 원천 기록(수집상품)의 소싱 판단 — 반려와 삭제. */
export const candidatesApi = {
  reject: (id: string, reason?: string) =>
    apiClient.post<RejectCandidateResponse>(`/api/sourcing/candidates/${id}/reject`, { reason }),
  delete: (id: string) =>
    apiClient.delete<{
      ok: boolean;
      archivedCandidateImages?: number;
      draftRetired?: boolean;
      draftWarning?: string;
    }>(`/api/sourcing/candidates/${id}`),
};

/**
 * basics 편집 폼 값 → 판매상품 초안 저장 입력.
 *
 * 판매가·정상가는 여기 없다 — 판매상품에서 가격은 옵션에 있다(`applyBasicsPriceToSalesProduct`).
 * `optionNames`·`tags`·로켓 필드·몰별 값은 이 화면(수집상품 basics)에서 더 이상 쓰지 않는다 —
 * 옵션은 옵션 표, 몰별 값은 `ChannelOverridesSection` 이 정본이다.
 */
export function salesProductUpdateInputFromBasics(
  input: UpdateProductBasicsInput,
  expectedVersion: number,
): SalesProductUpdateInput {
  const kcStatus = input.kcCertificationStatus === 'exists' || input.kcCertificationStatus === 'none'
    ? input.kcCertificationStatus
    : 'unknown';
  const certificationNumber = input.kcCertificationNumber?.trim();
  return {
    expectedVersion,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.category !== undefined ? { standardCategory: input.category || null } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.target !== undefined ? { targetAudience: input.target || null } : {}),
    ...(input.ageGroup !== undefined ? { ageGroup: input.ageGroup || null } : {}),
    ...(input.keywords !== undefined ? { keywords: input.keywords } : {}),
    ...(input.productSize !== undefined ? { productSize: input.productSize || null } : {}),
    ...(input.colorVariantNames !== undefined
      ? { colorVariantNames: parseCommaList(input.colorVariantNames) }
      : {}),
    ...(input.boxSetQuantity !== undefined
      ? { boxSetQuantity: parsePositiveIntOrNull(input.boxSetQuantity) }
      : {}),
    ...(input.brand !== undefined ? { brand: input.brand || null } : {}),
    ...(input.manufacturer !== undefined ? { manufacturer: input.manufacturer || null } : {}),
    ...(input.originCountry !== undefined ? { originCountry: input.originCountry || null } : {}),
    ...(input.modelName !== undefined ? { modelName: input.modelName || null } : {}),
    ...(input.ownCode !== undefined ? { ownCode: input.ownCode || null } : {}),
    ...(input.taxType !== undefined ? { taxType: input.taxType === 'tax_free' ? 'tax_free' : 'taxable' } : {}),
    ...(input.deliveryFee !== undefined ? { deliveryFee: input.deliveryFee || null } : {}),
    ...(input.deliveryFeeType !== undefined ? { deliveryFeeType: normalizeDeliveryFeeType(input.deliveryFeeType) } : {}),
    ...(input.kcCertificationStatus !== undefined ? { kcStatus } : {}),
    ...(certificationNumber
      ? {
        certifications: [{
          number: certificationNumber,
          ...(input.certificationIssuer?.trim() ? { issuer: input.certificationIssuer.trim() } : {}),
          ...(input.certificationField?.trim() ? { field: input.certificationField.trim() } : {}),
          ...(input.kcCertificationImageUrl?.trim() ? { imageUrl: input.kcCertificationImageUrl.trim() } : {}),
        }],
      }
      : {}),
  };
}

function parseCommaList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function parsePositiveIntOrNull(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeDeliveryFeeType(value: string): SalesProductUpdateInput['deliveryFeeType'] {
  const types = ['free', 'prepay', 'collect', 'collect_or_prepay'] as const;
  return types.find((type) => type === value) ?? null;
}

/**
 * basics 폼의 판매가·정상가를 초안의 판매(selling) 옵션 전체에 싣는다.
 *
 * 옵션마다 다른 가격을 매기는 것은 옵션 표의 일이다 — 이 폼은 "옵션이 아직 하나"인
 * 상품(대개 수집 직후)을 위한 빠른 저장이라 모든 판매 옵션에 같은 값을 적용한다.
 * 이미 같은 값이면 아무것도 보내지 않는다(WING 제출과 같은 규칙).
 */
export async function applyBasicsPriceToSalesProduct(
  salesProductId: string,
  salePrice: number,
  normalPrice: number,
): Promise<void> {
  const product = await salesProductApi.get(salesProductId);
  const unchanged = product.options.every((option) => option.supplyStatus === 'unused'
    || (option.salePrice === (salePrice || null) && option.normalPrice === (normalPrice || null)));
  if (unchanged) return;
  await salesProductApi.replaceOptions(salesProductId, {
    expectedVersion: product.version,
    optionAxes: product.optionAxes,
    options: product.options.map((option) => ({
      id: option.id,
      optionCode: option.optionCode ?? undefined,
      values: option.values,
      alias: option.alias,
      barcode: option.barcode,
      salePrice: option.supplyStatus === 'unused' ? option.salePrice : (salePrice || null),
      normalPrice: option.supplyStatus === 'unused' ? option.normalPrice : (normalPrice || null),
      supplyStatus: option.supplyStatus,
      safetyStock: option.safetyStock,
      components: option.components.map((component) => ({
        masterProductId: component.masterProductId,
        quantity: component.quantity,
      })),
    })),
  });
}

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
