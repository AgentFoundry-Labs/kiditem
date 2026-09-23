/**
 * 몰에서 읽은 옵션 판매가를 판매 상품 옵션에 반영할 계획을 만든다 — 순수 함수(KID-313 W2).
 *
 * 가격은 판매 상품 옵션 한 곳에만 있다. 등록 대상은 가격을 갖지 않으므로, 몰에 걸린 값이 모든 몰에서
 * 같을 때만 그 값을 옵션 판매가로 받는다. 같은 옵션이 몰마다 다른 값으로 팔리면 어느 값을 정본으로
 * 삼을지 근거가 없어 그 상품은 계획을 만들지 않고 충돌로 남긴다. 이 모듈은 저장소를 직접 쓰지 않는다.
 */

export interface MallPriceCandidateProduct {
  id: string;
  /** 판매 상품 버전 — 쓰는 쪽이 이 버전일 때만 옵션 판매가를 바꾼다. */
  version: number;
  options: { id: string; salePrice: number | null; normalPrice: number | null }[];
}

export interface MallPriceCandidateListingOption {
  channelAccountId: string;
  salesProductOptionId: string;
  salePrice: number | null;
}

/** 기존 public 결과 스키마를 유지하는 동안 세부 충돌은 하나의 이유로 투영한다. */
export type MallPriceConflictReason = 'options_disagree';

export interface MallPriceAdoptionWrite {
  salesProductId: string;
  expectedVersion: number;
  /** 가격 근거가 된 몰 계정(결과 요약의 몰별 수). */
  channelAccountIds: string[];
  optionPrices: { salesProductOptionId: string; salePrice: number }[];
}

export interface MallPriceAdoptionPlan {
  writes: MallPriceAdoptionWrite[];
  conflicts: {
    salesProductId: string;
    channelAccountIds: string[];
    reason: MallPriceConflictReason;
    prices: number[];
  }[];
  /** 몰 가격이 이미 옵션 판매가와 같은 상품. */
  unchanged: number;
}

interface ProductEvidence {
  product: MallPriceCandidateProduct;
  pricesByOption: Map<string, Set<number>>;
  accountsByOption: Map<string, Set<string>>;
}

export function planMallPriceAdoption(input: {
  products: readonly MallPriceCandidateProduct[];
  listingOptions: readonly MallPriceCandidateListingOption[];
}): MallPriceAdoptionPlan {
  const productByOptionId = new Map<string, MallPriceCandidateProduct>();
  for (const product of input.products) {
    for (const option of product.options) productByOptionId.set(option.id, product);
  }

  const evidenceByProduct = new Map<string, ProductEvidence>();
  for (const listingOption of input.listingOptions) {
    if (listingOption.salePrice === null) continue;
    const product = productByOptionId.get(listingOption.salesProductOptionId);
    if (!product) continue;
    const evidence = evidenceByProduct.get(product.id)
      ?? { product, pricesByOption: new Map<string, Set<number>>(), accountsByOption: new Map<string, Set<string>>() };
    const prices = evidence.pricesByOption.get(listingOption.salesProductOptionId) ?? new Set<number>();
    prices.add(listingOption.salePrice);
    evidence.pricesByOption.set(listingOption.salesProductOptionId, prices);
    const accounts = evidence.accountsByOption.get(listingOption.salesProductOptionId) ?? new Set<string>();
    accounts.add(listingOption.channelAccountId);
    evidence.accountsByOption.set(listingOption.salesProductOptionId, accounts);
    evidenceByProduct.set(product.id, evidence);
  }

  const plan: MallPriceAdoptionPlan = { writes: [], conflicts: [], unchanged: 0 };
  for (const evidence of evidenceByProduct.values()) {
    const accountIds = sortedUnique([...evidence.accountsByOption.values()].flatMap((accounts) => [...accounts]));
    const disagreeing = [...evidence.pricesByOption.values()].find((prices) => prices.size > 1);
    if (disagreeing) {
      plan.conflicts.push({
        salesProductId: evidence.product.id,
        channelAccountIds: accountIds,
        reason: 'options_disagree',
        prices: [...disagreeing].sort((left, right) => left - right),
      });
      continue;
    }
    const optionPrices = evidence.product.options.flatMap((option) => {
      const [observed] = [...(evidence.pricesByOption.get(option.id) ?? [])];
      return observed !== undefined && observed !== option.salePrice
        ? [{ salesProductOptionId: option.id, salePrice: observed }]
        : [];
    });
    if (optionPrices.length === 0) {
      plan.unchanged += 1;
      continue;
    }
    plan.writes.push({
      salesProductId: evidence.product.id,
      expectedVersion: evidence.product.version,
      channelAccountIds: accountIds,
      optionPrices,
    });
  }
  return plan;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
