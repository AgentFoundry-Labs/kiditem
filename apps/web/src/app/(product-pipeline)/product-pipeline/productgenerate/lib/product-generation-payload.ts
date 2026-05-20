import type {
  DetailImageCount,
  DetailPageAgeGroup,
  GenerateTemplateId,
  KcCertificationStatus,
  UsageSectionMode,
} from '../../detail-template-generation/hooks/useGenerateForm';

export interface ProductGenerationPayloadInput {
  title: string;
  category: string;
  keyword: string;
  target: string;
  description: string;
  thumbnailUrls: string[];
  imageUrls: string[];
  rawOptions: string;
  templateId: GenerateTemplateId;
  ageGroup: DetailPageAgeGroup;
  detailImageCount: DetailImageCount;
  usageSectionMode: UsageSectionMode;
  kcCertificationStatus: KcCertificationStatus;
  kcCertificationNumber: string;
  productSize: string;
  colorVariantStatus: string;
  colorVariantNames: string;
  boxSetStatus: string;
  boxSetQuantity: string;
}

export interface ProductGenerationPayload {
  title: string;
  category?: string;
  target?: string;
  description?: string;
  thumbnailUrl?: string;
  thumbnailUrls?: string[];
  imageUrls: string[];
  optionNames: string[];
  keywords?: string[];
  templateId: GenerateTemplateId;
  ageGroup: DetailPageAgeGroup;
  detailImageCount: DetailImageCount;
  usageSectionMode: UsageSectionMode;
  kcCertificationStatus: KcCertificationStatus;
  kcCertificationNumber?: string;
  productSize?: string;
  colorVariantStatus?: string;
  colorVariantNames?: string;
  boxSetStatus?: string;
  boxSetQuantity?: string;
}

export function buildProductGenerationPayload(
  input: ProductGenerationPayloadInput,
): ProductGenerationPayload {
  const thumbnailUrls = uniqueNonEmpty(input.thumbnailUrls);
  const keywords = keywordsFromInput(input.keyword);
  return compactUndefined({
    title: input.title.trim(),
    category: trimmedOrUndefined(input.category),
    target: trimmedOrUndefined(input.target),
    description: trimmedOrUndefined(input.description),
    thumbnailUrl: thumbnailUrls[0],
    thumbnailUrls: thumbnailUrls.length > 0 ? thumbnailUrls : undefined,
    imageUrls: uniqueNonEmpty(input.imageUrls),
    optionNames: optionNamesFromRawOptions(input.rawOptions),
    keywords: keywords.length > 0 ? keywords : undefined,
    templateId: input.templateId,
    ageGroup: input.ageGroup,
    detailImageCount: input.detailImageCount,
    usageSectionMode: input.usageSectionMode,
    kcCertificationStatus: input.kcCertificationStatus,
    kcCertificationNumber: trimmedOrUndefined(input.kcCertificationNumber),
    productSize: trimmedOrUndefined(input.productSize),
    colorVariantStatus: trimmedOrUndefined(input.colorVariantStatus),
    colorVariantNames: trimmedOrUndefined(input.colorVariantNames),
    boxSetStatus: trimmedOrUndefined(input.boxSetStatus),
    boxSetQuantity: trimmedOrUndefined(input.boxSetQuantity),
  });
}

function optionNamesFromRawOptions(rawOptions: string): string[] {
  return [...new Set(
    rawOptions
      .split(/[\n,]/)
      .map((option) => option.trim())
      .filter(Boolean),
  )].slice(0, 10);
}

function keywordsFromInput(rawKeyword: string): string[] {
  return [...new Set(
    rawKeyword
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean),
  )].slice(0, 10);
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 15);
}

function trimmedOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function compactUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
