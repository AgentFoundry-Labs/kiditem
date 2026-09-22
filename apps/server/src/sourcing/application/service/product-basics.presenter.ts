/**
 * `salePrice` 가 직접 입력되었는지 여부를 프런트가 표시할 수 있도록
 * 파생 값이지만 응답에 드러낸다.
 *
 *   - `input`:   수기 입력(`registrationInput.salePrice`)
 *   - `none`:    입력값 없음. `salePrice` 는 0이다.
 */
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
  salePriceSource: SalePriceSource;
  /** 사방넷 신규등록과 같은 칸(상품 등록 초안에서 받는다). 판매상품으로 만들 때 그대로 간다. */
  costPrice: number;
  brand: string;
  manufacturer: string;
  originCountry: string;
  modelName: string;
  ownCode: string;
  /** `taxable` 과세 · `tax_free` 면세. */
  taxType: string;
  /** 사방넷 `배송비`(VAT 포함)와 `배송비구분`. */
  deliveryFee: number;
  deliveryFeeType: string;
  /** 사방넷 인증정보의 인증기관 · 인증분야. 번호는 `kcCertificationNumber` 다. */
  certificationIssuer: string;
  certificationField: string;
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
  /**
   * 몰별 상품등록 칸 값. `{ 몰키: { 칸키: 값 } }`.
   *
   * 상품마다 한 번 정해 두면 목록에서 버튼만 눌러 등록할 수 있다. 서버는 뜻을
   * 모른다 — 어느 몰이 어떤 칸을 요구하는지 아는 것은 프런트 어댑터뿐이다.
   */
  mallRegisterValues: Record<string, Record<string, string>>;
  /** 여러 몰이 함께 쓰는 칸 값(안전인증번호 등). `{ 칸키: 값 }`. */
  mallRegisterShared: Record<string, string>;
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

/** `{ 키: 문자열 }` 만 남긴다. 다른 타입이 섞여 있으면 그 항목만 버린다. */
const stringMap = (value: unknown): Record<string, string> => {
  const source = toRecord(value);
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry === 'string') result[key] = entry;
  }
  return result;
};

/** `{ 키: { 키: 문자열 } }`. 빈 몰은 담지 않는다. */
const stringMapMap = (value: unknown): Record<string, Record<string, string>> => {
  const source = toRecord(value);
  const result: Record<string, Record<string, string>> = {};
  for (const [key, entry] of Object.entries(source)) {
    const inner = stringMap(entry);
    if (Object.keys(inner).length > 0) result[key] = inner;
  }
  return result;
};

/** 앞 값이 비어 있으면 뒤 값으로 폴백하는 문자열 배열 선택. */
const pickStrings = (primary: unknown, fallback: unknown): string[] => {
  const primaryValues = strings(primary);
  return primaryValues.length > 0 ? primaryValues : strings(fallback);
};

/**
 * 후보의 content workspace 에 저장된 대표 썸네일. `ProductPreparation` 이 없는
 * 후보는 여기에만 대표를 남길 수 있어서, 이 값이 없으면 저장한 대표가 재진입 후
 * 사라진 것처럼 보인다. 준비(preparation) 값이 있으면 **항상 그쪽이 이긴다**.
 */
export interface WorkspaceThumbnailSelection {
  url: string;
  sourceThumbnailGenerationId: string | null;
  sourceThumbnailCandidateId: string | null;
}

export function buildProductBasics({
  candidate,
  preparation,
  registrationImages,
  workspaceThumbnailSelection,
}: {
  candidate: CandidateLike;
  preparation: PreparationLike;
  registrationImages?: RegistrationImages | null;
  /** 조회는 호출자(서비스) 몫이다. 프리젠터는 순수 함수로 남는다. */
  workspaceThumbnailSelection?: WorkspaceThumbnailSelection | null;
}): ProductBasics {
  const raw = toRecord(candidate.rawData);
  // `ProductPreparation` 이 없는 후보가 기본정보를 저장하는 곳. 후보 워크스페이스
  // 화면의 `수정` 저장이 여기에 쓴다(= `PATCH /api/sourcing/candidates/:id/basic-info`).
  // 우선순위는 준비 registrationInput > 수기 manualBasics > 스크랩 raw/컬럼 이다 —
  // 준비가 생기면 registrationInput 이 이기고, 그 전까지는 manualBasics 가 이긴다.
  const manual = toRecord(raw.manualBasics);
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

  // 등록 입력과 후보 수기 저장값(manual)은 사용자 입력으로 취급하고, 사용자가
  // 고친 값을 덮어쓰지 않는다.
  // 상품 등록 초안이 적어 준 값도 사람이 넣은 값이다(rawData). 수기 저장값 다음 순서로 읽는다.
  const inputSalePrice = num(input.salePrice) || num(manual.salePrice) || num(raw.salePrice);
  const salePrice = inputSalePrice;
  const salePriceSource: SalePriceSource = inputSalePrice > 0 ? 'input' : 'none';

  return {
    name: str(input.name) ?? str(input.title) ?? candidate.name,
    category: str(input.category) ?? candidate.category ?? '',
    description: str(input.description) ?? candidate.description ?? '',
    target: str(input.target) ?? str(manual.target) ?? str(raw.target) ?? '',
    ageGroup: str(input.ageGroup) ?? str(manual.ageGroup) ?? str(raw.ageGroup) ?? '',
    tags: inputTags.length > 0 ? inputTags : strings(candidate.tags),
    // 상품 등록(직접 등록 · AI 채움)은 키워드를 rawData.keywords 에 남긴다. 사람이 적은
    // 값이 없을 때 그걸 읽지 않으면 몰 등록 초안의 키워드가 옵션 이름으로 떨어진다.
    keywords: pickStrings(input.keywords, pickStrings(manual.keywords, raw.keywords)),
    optionNames: inputOptions.length > 0
      ? inputOptions
      : pickStrings(manual.optionNames, raw.optionNames ?? raw.options),
    kcCertificationStatus: str(input.kcCertificationStatus) ?? str(manual.kcCertificationStatus) ?? str(raw.kcCertificationStatus) ?? '',
    kcCertificationNumber: str(input.kcCertificationNumber) ?? str(manual.kcCertificationNumber) ?? str(raw.kcCertificationNumber) ?? '',
    kcCertificationImageUrl: str(input.kcCertificationImageUrl) ?? str(manual.kcCertificationImageUrl) ?? str(raw.kcCertificationImageUrl) ?? '',
    productSize: str(input.productSize) ?? str(manual.productSize) ?? str(raw.productSize) ?? '',
    colorVariantStatus: str(input.colorVariantStatus) ?? str(manual.colorVariantStatus) ?? str(raw.colorVariantStatus) ?? '',
    colorVariantNames: str(input.colorVariantNames) ?? str(manual.colorVariantNames) ?? str(raw.colorVariantNames) ?? '',
    boxSetStatus: str(input.boxSetStatus) ?? str(manual.boxSetStatus) ?? str(raw.boxSetStatus) ?? '',
    boxSetQuantity: str(input.boxSetQuantity) ?? str(manual.boxSetQuantity) ?? str(raw.boxSetQuantity) ?? '',
    originalPrice: num(input.originalPrice) || num(manual.originalPrice) || num(raw.tagPrice),
    costPrice: num(input.costPrice) || num(manual.costPrice) || num(raw.costPrice),
    brand: str(input.brand) ?? str(manual.brand) ?? str(raw.brand) ?? '',
    manufacturer: str(input.manufacturer) ?? str(manual.manufacturer) ?? str(raw.manufacturer) ?? '',
    originCountry: str(input.originCountry) ?? str(manual.originCountry) ?? str(raw.originCountry) ?? '',
    modelName: str(input.modelName) ?? str(manual.modelName) ?? str(raw.modelName) ?? '',
    ownCode: str(input.ownCode) ?? str(manual.ownCode) ?? str(raw.ownCode) ?? '',
    taxType: str(input.taxType) ?? str(manual.taxType) ?? str(raw.taxType) ?? 'taxable',
    deliveryFee: num(input.deliveryFee) || num(manual.deliveryFee) || num(raw.deliveryFee),
    deliveryFeeType: str(input.deliveryFeeType) ?? str(manual.deliveryFeeType) ?? str(raw.deliveryFeeType) ?? '',
    certificationIssuer: str(input.certificationIssuer) ?? str(manual.certificationIssuer) ?? str(raw.certificationIssuer) ?? '',
    certificationField: str(input.certificationField) ?? str(manual.certificationField) ?? str(raw.certificationField) ?? '',
    salePrice,
    salePriceSource,
    discountRate: num(input.discountRate) || num(manual.discountRate),
    rocketBundleQuantity: num(input.rocketBundleQuantity) || num(manual.rocketBundleQuantity),
    rocketUnitCost: num(input.rocketUnitCost) || num(manual.rocketUnitCost),
    thumbnailUrls: [...new Set(thumbnailUrls)],
    thumbnailPreviewUrls: [...new Set(thumbnailPreviewUrls)],
    registrationImages: {
      primary: strings(registrationImages?.primary),
      thumbnail: strings(registrationImages?.thumbnail),
      detail: strings(registrationImages?.detail),
    },
    // 몰별 등록 칸은 준비가 있어도 후보에 저장한 값(manualBasics)만 읽는다. 송신 전 점검과
    // 폼 채우기가 그 문서를 읽으므로, 준비 registrationInput 에 남은 옛 사본이 이기면 화면과
    // 점검이 서로 다른 값을 본다.
    mallRegisterValues: stringMapMap(manual.mallRegisterValues),
    mallRegisterShared: stringMap(manual.mallRegisterShared),
    // 준비가 이긴다. 워크스페이스 선택은 준비가 없는 후보를 위한 폴백이다.
    // 폴백 여부는 대표 URL 하나로 판정한다 — 준비에 대표가 있는데 파생 id 만
    // 워크스페이스에서 끌어오면 서로 다른 이미지의 값이 섞인다.
    selectedThumbnailUrl:
      preparation?.selectedThumbnailUrl ?? workspaceThumbnailSelection?.url ?? null,
    selectedThumbnailGenerationCandidateId: preparation?.selectedThumbnailUrl
      ? preparation.selectedThumbnailGenerationCandidateId ?? null
      : workspaceThumbnailSelection?.sourceThumbnailCandidateId ?? null,
    selectedDetailPageGenerationId: preparation?.selectedDetailPageGenerationId ?? null,
    selectedDetailPageArtifactId: preparation?.selectedDetailPageArtifactId ?? null,
    selectedDetailPageRevisionId: preparation?.selectedDetailPageRevisionId ?? null,
  };
}
