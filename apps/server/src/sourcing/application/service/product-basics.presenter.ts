/**
 * `salePrice` 가 어디서 왔는지. 프런트가 "셀피아 재고에서 가져온 값" 임을
 * 표시할 수 있어야 하므로 파생 값이지만 응답에 드러낸다.
 *
 *   - `input`:   수기 입력(`registrationInput.salePrice`)
 *   - `sellpia`: 이름이 정확히 일치한 셀피아 재고 SKU 판매가 폴백
 *   - `none`:    둘 다 없음. `salePrice` 는 0이다.
 */
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
  salePriceSource: SalePriceSource;
  discountRate: number;
  rocketBundleQuantity: number;
  rocketUnitCost: number;
  thumbnailUrls: string[];
  thumbnailPreviewUrls: string[];
  /**
   * Channel-registration images resolved from `ContentAsset.role`, NOT from the
   * scrape originals. Empty arrays mean the candidate has no role-tagged assets
   * yet; callers must fall back rather than substitute `role = 'source'` rows,
   * which are raw originals that fail the Coupang 1,000x1,000 spec.
   */
  registrationImages: RegistrationImages;
  selectedThumbnailUrl: string | null;
  selectedThumbnailGenerationCandidateId: string | null;
  selectedDetailPageGenerationId: string | null;
  selectedDetailPageArtifactId: string | null;
  selectedDetailPageRevisionId: string | null;
}

export interface RegistrationImages {
  primary: string[];
  thumbnail: string[];
  detail: string[];
}

type CandidateLike = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: unknown;
  rawData: unknown;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  images: Array<{
    url: string;
    sortOrder?: number | null;
    role?: string | null;
    isPrimary?: boolean | null;
  }>;
};

type PreparationLike = {
  registrationInput: unknown;
  selectedThumbnailUrl: string | null;
  selectedThumbnailGenerationCandidateId?: string | null;
  selectedDetailPageGenerationId: string | null;
  selectedDetailPageArtifactId?: string | null;
  selectedDetailPageRevisionId?: string | null;
} | null;

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export function buildProductBasics({
  candidate,
  preparation,
  registrationImages,
  sellpiaSalePrice,
}: {
  candidate: CandidateLike;
  preparation: PreparationLike;
  registrationImages?: RegistrationImages | null;
  /**
   * 이름이 정확히 일치한 셀피아 재고 SKU 의 판매가. 조회는 호출자(서비스) 몫이고
   * 프리젠터는 순수 함수로 남는다. 매칭 실패는 `null`/`undefined` 이며, 추정하지
   * 않고 0원으로 남긴다.
   */
  sellpiaSalePrice?: number | null;
}): ProductBasics {
  const raw = toRecord(candidate.rawData);
  const input = toRecord(preparation?.registrationInput);
  const inputTags = strings(input.tags);
  const inputOptions = strings(input.optionNames);
  const thumbnailPreviewUrls = strings(input.thumbnailUrls);
  const thumbnailUrls = [
    ...candidate.images
      .filter((image) => !image.role || image.role === 'product')
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((image) => image.url),
    candidate.thumbnailUrl,
    candidate.imageUrl,
  ].filter((url): url is string => typeof url === 'string' && url.trim().length > 0);

  // 수기 입력이 항상 이긴다. 셀피아 판매가는 수기 값이 비어 있을 때만 채우는
  // 폴백이며, 사용자가 고친 값을 절대 덮어쓰지 않는다.
  const inputSalePrice = num(input.salePrice);
  const fallbackSalePrice = num(sellpiaSalePrice);
  const salePrice = inputSalePrice > 0 ? inputSalePrice : fallbackSalePrice;
  const salePriceSource: SalePriceSource =
    inputSalePrice > 0 ? 'input' : fallbackSalePrice > 0 ? 'sellpia' : 'none';

  return {
    name: str(input.name) ?? str(input.title) ?? candidate.name,
    category: str(input.category) ?? candidate.category ?? '',
    description: str(input.description) ?? candidate.description ?? '',
    target: str(input.target) ?? str(raw.target) ?? '',
    ageGroup: str(input.ageGroup) ?? str(raw.ageGroup) ?? '',
    tags: inputTags.length > 0 ? inputTags : strings(candidate.tags),
    keywords: strings(input.keywords),
    optionNames: inputOptions.length > 0 ? inputOptions : strings(raw.optionNames ?? raw.options),
    kcCertificationStatus: str(input.kcCertificationStatus) ?? str(raw.kcCertificationStatus) ?? '',
    kcCertificationNumber: str(input.kcCertificationNumber) ?? str(raw.kcCertificationNumber) ?? '',
    kcCertificationImageUrl: str(input.kcCertificationImageUrl) ?? str(raw.kcCertificationImageUrl) ?? '',
    productSize: str(input.productSize) ?? str(raw.productSize) ?? '',
    colorVariantStatus: str(input.colorVariantStatus) ?? str(raw.colorVariantStatus) ?? '',
    colorVariantNames: str(input.colorVariantNames) ?? str(raw.colorVariantNames) ?? '',
    boxSetStatus: str(input.boxSetStatus) ?? str(raw.boxSetStatus) ?? '',
    boxSetQuantity: str(input.boxSetQuantity) ?? str(raw.boxSetQuantity) ?? '',
    originalPrice: num(input.originalPrice),
    salePrice,
    salePriceSource,
    discountRate: num(input.discountRate),
    rocketBundleQuantity: num(input.rocketBundleQuantity),
    rocketUnitCost: num(input.rocketUnitCost),
    thumbnailUrls: [...new Set(thumbnailUrls)],
    thumbnailPreviewUrls: [...new Set(thumbnailPreviewUrls)],
    registrationImages: {
      primary: strings(registrationImages?.primary),
      thumbnail: strings(registrationImages?.thumbnail),
      detail: strings(registrationImages?.detail),
    },
    selectedThumbnailUrl: preparation?.selectedThumbnailUrl ?? null,
    selectedThumbnailGenerationCandidateId: preparation?.selectedThumbnailGenerationCandidateId ?? null,
    selectedDetailPageGenerationId: preparation?.selectedDetailPageGenerationId ?? null,
    selectedDetailPageArtifactId: preparation?.selectedDetailPageArtifactId ?? null,
    selectedDetailPageRevisionId: preparation?.selectedDetailPageRevisionId ?? null,
  };
}
