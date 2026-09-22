import type {
  ProductBasics,
  UpdateProductBasicsInput,
} from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import { unitCostFromCostCny } from './rocket-pricing';
import type { ProductEditState } from './product-workspace-types';

export interface BasicDraft {
  name: string;
  category: string;
  description: string;
  target: string;
  ageGroup: string;
  tags: string[];
  kcCertificationStatus: string;
  kcCertificationNumber: string;
  kcCertificationImageUrl: string;
  productSize: string;
  colorVariantStatus: string;
  colorVariantNames: string;
  boxSetStatus: string;
  boxSetQuantity: string;
  optionNames: string;
  keywords: string;
  salePrice: string;
  originalPrice: string;
  discountRate: string;
  rocketBundleQuantity: string;
  rocketUnitCost: string;
  // 사방넷 신규등록과 같은 칸(상품 등록 초안에서 받는다). 판매상품으로 만들 때 그대로 간다.
  costPrice: string;
  brand: string;
  manufacturer: string;
  originCountry: string;
  modelName: string;
  ownCode: string;
  taxType: string;
  deliveryFee: string;
  deliveryFeeType: string;
  certificationIssuer: string;
  certificationField: string;
}

export function basicDraftFrom({
  basicInfo,
  editData,
  costCny,
}: {
  basicInfo: ProductBasics | null;
  editData: ProductEditState;
  costCny?: number | null;
}): BasicDraft {
  const storedUnitCost = basicInfo?.rocketUnitCost ?? 0;
  const autoUnitCost = unitCostFromCostCny(costCny);
  const unitCost = storedUnitCost > 0 ? storedUnitCost : autoUnitCost;
  const bundleQuantity = basicInfo?.rocketBundleQuantity ?? 0;
  return {
    name: basicInfo?.name ?? editData.name,
    category: basicInfo?.category ?? editData.category,
    description: basicInfo?.description ?? '',
    target: basicInfo?.target ?? '',
    ageGroup: basicInfo?.ageGroup ?? '',
    tags: basicInfo?.tags ?? editData.tags,
    kcCertificationStatus: basicInfo?.kcCertificationStatus ?? '',
    kcCertificationNumber: basicInfo?.kcCertificationNumber ?? '',
    kcCertificationImageUrl: basicInfo?.kcCertificationImageUrl ?? '',
    productSize: basicInfo?.productSize ?? '',
    colorVariantStatus: basicInfo?.colorVariantStatus ?? '',
    colorVariantNames: basicInfo?.colorVariantNames ?? '',
    boxSetStatus: basicInfo?.boxSetStatus ?? '',
    boxSetQuantity: basicInfo?.boxSetQuantity ?? '',
    optionNames: (basicInfo?.optionNames ?? []).join(', '),
    keywords: (basicInfo?.keywords ?? []).join(', '),
    salePrice: moneyInputValue(basicInfo?.salePrice ?? editData.salePrice),
    originalPrice: moneyInputValue(basicInfo?.originalPrice ?? editData.originalPrice),
    discountRate: moneyInputValue(basicInfo?.discountRate ?? editData.discountRate),
    rocketBundleQuantity: bundleQuantity > 0 ? String(bundleQuantity) : '1',
    rocketUnitCost: unitCost > 0 ? String(unitCost) : '',
    costPrice: moneyInputValue(basicInfo?.costPrice),
    brand: basicInfo?.brand ?? '',
    manufacturer: basicInfo?.manufacturer ?? '',
    originCountry: basicInfo?.originCountry ?? '',
    modelName: basicInfo?.modelName ?? '',
    ownCode: basicInfo?.ownCode ?? '',
    taxType: basicInfo?.taxType ?? '',
    deliveryFee: moneyInputValue(basicInfo?.deliveryFee),
    deliveryFeeType: basicInfo?.deliveryFeeType ?? '',
    certificationIssuer: basicInfo?.certificationIssuer ?? '',
    certificationField: basicInfo?.certificationField ?? '',
  };
}

/** Build the reviewed registration input from the operator form. */
export function productBasicsInputFromDraft(
  draft: BasicDraft,
): UpdateProductBasicsInput {
  const salePrice = parseMoney(draft.salePrice);
  return {
    name: draft.name.trim(),
    category: draft.category.trim(),
    description: draft.description,
    target: draft.target,
    ageGroup: draft.ageGroup,
    kcCertificationStatus: draft.kcCertificationStatus,
    kcCertificationNumber: draft.kcCertificationNumber,
    kcCertificationImageUrl: draft.kcCertificationImageUrl,
    productSize: draft.productSize,
    colorVariantStatus: draft.colorVariantStatus,
    colorVariantNames: draft.colorVariantNames,
    boxSetStatus: draft.boxSetStatus,
    boxSetQuantity: draft.boxSetQuantity,
    optionNames: parseList(draft.optionNames),
    keywords: parseList(draft.keywords),
    tags: draft.tags,
    salePrice,
    originalPrice: parseMoney(draft.originalPrice),
    discountRate: parseMoney(draft.discountRate),
    rocketBundleQuantity: parseQuantity(draft.rocketBundleQuantity),
    rocketUnitCost: parseMoney(draft.rocketUnitCost),
    costPrice: parseMoney(draft.costPrice),
    brand: draft.brand.trim(),
    manufacturer: draft.manufacturer.trim(),
    originCountry: draft.originCountry.trim(),
    modelName: draft.modelName.trim(),
    ownCode: draft.ownCode.trim(),
    taxType: draft.taxType,
    deliveryFee: parseMoney(draft.deliveryFee),
    deliveryFeeType: draft.deliveryFeeType,
    certificationIssuer: draft.certificationIssuer.trim(),
    certificationField: draft.certificationField.trim(),
  };
}

export function parseMoney(value: string): number {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function moneyInputValue(value: number | null | undefined): string {
  return Number.isFinite(value) && (value ?? 0) > 0 ? String(Math.round(value ?? 0)) : '';
}

/** `moneyInputValue` -> `parseMoney` 왕복 후의 값. 하이드레이션 대조용. */
function moneyRounded(value: number | null | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.round(value ?? 0) : 0;
}

function parseQuantity(value: string): number {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

function parseList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
