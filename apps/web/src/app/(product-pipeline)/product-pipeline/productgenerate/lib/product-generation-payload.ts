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
  target: string;
  description: string;
  thumbnailUrl: string | null;
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
  imageUrls: string[];
  optionNames: string[];
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
  return compactUndefined({
    title: input.title.trim(),
    category: trimmedOrUndefined(input.category),
    target: trimmedOrUndefined(input.target),
    description: trimmedOrUndefined(input.description),
    thumbnailUrl: input.thumbnailUrl?.trim() || undefined,
    imageUrls: uniqueNonEmpty(input.imageUrls),
    optionNames: optionNamesFromRawOptions(input.rawOptions),
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
