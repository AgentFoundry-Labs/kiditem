/**
 * 몰 가격을 몰별 값으로 가져오기(ADR-0013, 사장님 2026-09-19 "몰 가격을 몰별 값으로 저장") — 순수 함수.
 *
 * 몰에 지금 걸린 가격(몰 상품을 가져올 때 읽은 옵션 가격)이 판매상품 기준 가격과 다르면, 그 몰 계정의 몰별 판매가를
 * 몰 가격에 맞춘다. 몰은 건드리지 않는다. 몰별 값은 몰 하나에 판매가 하나(단품은 추가금액)라, 같은 몰에서 옵션마다
 * 또는 몰 상품마다 맞출 값이 다르면 고르지 않고 엇갈림으로 남긴다.
 */

export interface MallPriceCandidateProduct {
  id: string;
  salePrice: number;
  options: { id: string; extraPrice: number }[];
  overrides: { channelAccountId: string; salePrice: number | null; priceRateBp: number | null }[];
}

export interface MallPriceCandidateListingOption {
  channelAccountId: string;
  salesProductOptionId: string;
  salePrice: number | null;
}

export type MallPriceConflictReason = 'options_disagree' | 'below_extra_price';

export interface MallPriceAdoptionPlan {
  writes: { salesProductId: string; channelAccountId: string; salePrice: number }[];
  conflicts: { salesProductId: string; channelAccountId: string; reason: MallPriceConflictReason; prices: number[] }[];
  /** 몰 가격이 이미 판매상품 기준과 같은 상품 × 몰. */
  unchanged: number;
}

/** 몰별 값이 정하는 이 몰의 기준 판매가(추가금액 전). 금액이 %보다 먼저다. */
function currentBase(
  product: MallPriceCandidateProduct,
  override: MallPriceCandidateProduct['overrides'][number] | undefined,
): number {
  if (override?.salePrice !== null && override?.salePrice !== undefined) return override.salePrice;
  if (override?.priceRateBp) return Math.round((product.salePrice * override.priceRateBp) / 10_000);
  return product.salePrice;
}

export function planMallPriceAdoption(input: {
  products: readonly MallPriceCandidateProduct[];
  listingOptions: readonly MallPriceCandidateListingOption[];
}): MallPriceAdoptionPlan {
  const productByOptionId = new Map<string, { product: MallPriceCandidateProduct; extraPrice: number }>();
  for (const product of input.products) {
    for (const option of product.options) productByOptionId.set(option.id, { product, extraPrice: option.extraPrice });
  }

  // 상품 × 몰 계정마다, 몰 옵션 가격에서 추가금액을 뺀 "몰이 쓰는 기준 판매가" 들.
  const basesByPair = new Map<string, { product: MallPriceCandidateProduct; channelAccountId: string; bases: Set<number> }>();
  for (const listingOption of input.listingOptions) {
    if (listingOption.salePrice === null) continue;
    const owner = productByOptionId.get(listingOption.salesProductOptionId);
    if (!owner) continue;
    const key = `${owner.product.id}|${listingOption.channelAccountId}`;
    const entry = basesByPair.get(key)
      ?? { product: owner.product, channelAccountId: listingOption.channelAccountId, bases: new Set<number>() };
    entry.bases.add(listingOption.salePrice - owner.extraPrice);
    basesByPair.set(key, entry);
  }

  const plan: MallPriceAdoptionPlan = { writes: [], conflicts: [], unchanged: 0 };
  for (const { product, channelAccountId, bases } of basesByPair.values()) {
    const prices = [...bases].sort((left, right) => left - right);
    if (prices.length > 1) {
      plan.conflicts.push({ salesProductId: product.id, channelAccountId, reason: 'options_disagree', prices });
      continue;
    }
    const [base] = prices;
    if (base! <= 0) {
      plan.conflicts.push({ salesProductId: product.id, channelAccountId, reason: 'below_extra_price', prices });
      continue;
    }
    const override = product.overrides.find((item) => item.channelAccountId === channelAccountId);
    if (base === currentBase(product, override)) {
      plan.unchanged += 1;
      continue;
    }
    plan.writes.push({ salesProductId: product.id, channelAccountId, salePrice: base! });
  }
  return plan;
}
