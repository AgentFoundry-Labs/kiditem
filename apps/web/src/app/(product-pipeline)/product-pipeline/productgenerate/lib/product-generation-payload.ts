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
  // 사방넷 신규등록과 같은 칸(글자로 받아 숫자로 보낸다). 이 칸이 없는 화면도 있어 모두 선택이다.
  salePrice?: string;
  tagPrice?: string;
  costPrice?: string;
  brand?: string;
  manufacturer?: string;
  originCountry?: string;
  modelName?: string;
  ownCode?: string;
  taxType?: 'taxable' | 'tax_free';
  deliveryFee?: string;
  deliveryFeeType?: 'free' | 'prepay' | 'collect' | 'collect_or_prepay';
  certificationIssuer?: string;
  certificationField?: string;
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
  salePrice?: number;
  tagPrice?: number;
  costPrice?: number;
  brand?: string;
  manufacturer?: string;
  originCountry?: string;
  modelName?: string;
  ownCode?: string;
  taxType?: 'taxable' | 'tax_free';
  deliveryFee?: number;
  deliveryFeeType?: 'free' | 'prepay' | 'collect' | 'collect_or_prepay';
  certificationIssuer?: string;
  certificationField?: string;
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
    salePrice: wonOrUndefined(input.salePrice),
    tagPrice: wonOrUndefined(input.tagPrice),
    costPrice: wonOrUndefined(input.costPrice),
    brand: trimmedOrUndefined(input.brand),
    manufacturer: trimmedOrUndefined(input.manufacturer),
    originCountry: trimmedOrUndefined(input.originCountry),
    modelName: trimmedOrUndefined(input.modelName),
    ownCode: trimmedOrUndefined(input.ownCode),
    // 과세가 기본이라 면세일 때만 보낸다.
    taxType: input.taxType === 'tax_free' ? ('tax_free' as const) : undefined,
    deliveryFee: wonOrUndefined(input.deliveryFee),
    // 무료가 아니면서 배송비를 적었을 때만 구분이 뜻을 가진다.
    deliveryFeeType: input.deliveryFeeType,
    certificationIssuer: trimmedOrUndefined(input.certificationIssuer),
    certificationField: trimmedOrUndefined(input.certificationField),
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

function trimmedOrUndefined(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : undefined;
}

function compactUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

/** `12,000` · ` 1200 ` 같은 글자를 원 단위 숫자로. 0 이하 · 숫자가 아니면 보내지 않는다. */
function wonOrUndefined(value: string | undefined): number | undefined {
  const parsed = Number((value ?? '').replace(/[,\s원]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}
