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
  };
}

/**
 * 폼 초안을 저장 payload 로 바꾼다.
 *
 * `hydratedBasicInfo` 는 이 초안을 만들 때 쓴 서버 값이다. 넘기면 "사용자가 손대지
 * 않은 셀피아 폴백 판매가" 를 payload 에서 빼준다. 빼지 않으면 사용자가 상품명만
 * 고쳐 저장해도 폴백 가격이 `registrationInput.salePrice` 에 눌러앉아 수기 입력과
 * 구분할 수 없게 굳는다(source 가 영영 'input' 으로 바뀌고, 셀피아 가격이 나중에
 * 바뀌어도 따라가지 않는다). 서버 머지는 키 단위라 빠진 키는 그대로 보존된다.
 */
export function productBasicsInputFromDraft(
  draft: BasicDraft,
  hydratedBasicInfo?: ProductBasics | null,
): UpdateProductBasicsInput {
  const salePrice = parseMoney(draft.salePrice);
  const isUntouchedSellpiaFallback =
    hydratedBasicInfo?.salePriceSource === 'sellpia' &&
    salePrice === moneyRounded(hydratedBasicInfo.salePrice);
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
    ...(isUntouchedSellpiaFallback ? {} : { salePrice }),
    originalPrice: parseMoney(draft.originalPrice),
    discountRate: parseMoney(draft.discountRate),
    rocketBundleQuantity: parseQuantity(draft.rocketBundleQuantity),
    rocketUnitCost: parseMoney(draft.rocketUnitCost),
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
