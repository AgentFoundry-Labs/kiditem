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
}: {
  candidate: CandidateLike;
  preparation: PreparationLike;
  registrationImages?: RegistrationImages | null;
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
    salePrice: num(input.salePrice),
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
