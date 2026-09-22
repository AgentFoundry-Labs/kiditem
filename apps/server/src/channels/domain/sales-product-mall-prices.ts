/**
 * 몰에서 읽은 옵션별 최종 판매가를 기존 등록 대상에 반영할 계획을 만든다.
 *
 * `ProductPreparation`이 상품 × 계정의 유일한 가격 저장소다. 이 모듈은
 * 저장소를 직접 쓰지 않고, 같은 옵션에 서로 다른 몰 가격이 있거나 대상이
 * 여러 개/없는 경우에는 계획을 만들지 않는다.
 */

export interface MallPriceCandidateTargetOption {
  salesProductOptionId: string;
  salePrice: number | null;
  normalPrice: number | null;
  supplyPrice: number | null;
}

export interface MallPriceCandidateTarget {
  id: string;
  channelAccountId: string;
  version: number;
  selectedOptions: MallPriceCandidateTargetOption[];
}

export interface MallPriceCandidateProduct {
  id: string;
  options: { id: string; salePrice: number; normalPrice: number | null }[];
  /** 살아 있는 등록 대상. 같은 계정에 여러 개가 있으면 채택하지 않는다. */
  targets: MallPriceCandidateTarget[];
}

export interface MallPriceCandidateListingOption {
  channelAccountId: string;
  salesProductOptionId: string;
  salePrice: number | null;
}

/** 기존 public 결과 스키마를 유지하는 동안 세부 충돌은 하나의 이유로 투영한다. */
export type MallPriceConflictReason = 'options_disagree' | 'below_extra_price';

export interface MallPriceAdoptionWrite {
  salesProductId: string;
  channelAccountId: string;
  /** compatibility caller가 읽던 대표값. 실제 저장은 optionPrices를 사용한다. */
  salePrice: number;
  targetId: string;
  expectedVersion: number;
  optionPrices: { salesProductOptionId: string; salePrice: number }[];
}

export interface MallPriceAdoptionPlan {
  writes: MallPriceAdoptionWrite[];
  conflicts: {
    salesProductId: string;
    channelAccountId: string;
    reason: MallPriceConflictReason;
    prices: number[];
  }[];
  /** 몰 가격이 이미 등록 대상의 옵션별 최종가와 같은 상품 × 몰. */
  unchanged: number;
}

interface PairEvidence {
  product: MallPriceCandidateProduct;
  channelAccountId: string;
  pricesByOption: Map<string, Set<number>>;
}

/**
 * 활성 몰 옵션의 가격을 옵션별 최종가로 채택한다.
 *
 * 같은 옵션에 서로 다른 가격이 있으면 어떤 값을 저장할지 정할 근거가
 * 없으므로 충돌로 남긴다. 대상이 정확히 하나가 아니면 새 대상을 만들거나
 * 첫 대상을 고르지 않는다. 대상이 선택하지 않은 옵션의 가격만 들어온
 * 경우에도 같은 이유로 충돌 처리한다.
 */
export function planMallPriceAdoption(input: {
  products: readonly MallPriceCandidateProduct[];
  listingOptions: readonly MallPriceCandidateListingOption[];
}): MallPriceAdoptionPlan {
  const productByOptionId = new Map<string, MallPriceCandidateProduct>();
  for (const product of input.products) {
    for (const option of product.options) productByOptionId.set(option.id, product);
  }

  const pairs = new Map<string, PairEvidence>();
  for (const listingOption of input.listingOptions) {
    if (listingOption.salePrice === null) continue;
    const product = productByOptionId.get(listingOption.salesProductOptionId);
    if (!product) continue;
    const key = `${product.id}|${listingOption.channelAccountId}`;
    const evidence = pairs.get(key) ?? {
      product,
      channelAccountId: listingOption.channelAccountId,
      pricesByOption: new Map<string, Set<number>>(),
    };
    const prices = evidence.pricesByOption.get(listingOption.salesProductOptionId) ?? new Set<number>();
    prices.add(listingOption.salePrice);
    evidence.pricesByOption.set(listingOption.salesProductOptionId, prices);
    pairs.set(key, evidence);
  }

  const plan: MallPriceAdoptionPlan = { writes: [], conflicts: [], unchanged: 0 };
  for (const evidence of pairs.values()) {
    const targets = evidence.product.targets.filter((target) => target.channelAccountId === evidence.channelAccountId);
    const allPrices = [...evidence.pricesByOption.values()].flatMap((prices) => [...prices]);
    const distinctPrices = [...new Set(allPrices)].sort((left, right) => left - right);
    if (targets.length !== 1) {
      plan.conflicts.push({
        salesProductId: evidence.product.id,
        channelAccountId: evidence.channelAccountId,
        reason: 'options_disagree',
        prices: distinctPrices,
      });
      continue;
    }

    const target = targets[0]!;
    const selectedIds = new Set(target.selectedOptions.map((option) => option.salesProductOptionId));
    const unselectedEvidence = [...evidence.pricesByOption.keys()].some((id) => !selectedIds.has(id));
    if (unselectedEvidence) {
      plan.conflicts.push({
        salesProductId: evidence.product.id,
        channelAccountId: evidence.channelAccountId,
        reason: 'options_disagree',
        prices: distinctPrices,
      });
      continue;
    }

    const canonicalById = new Map(evidence.product.options.map((option) => [option.id, option]));
    const optionPrices: { salesProductOptionId: string; salePrice: number }[] = [];
    let hasEvidence = false;
    let optionConflict = false;
    for (const selection of target.selectedOptions) {
      const prices = evidence.pricesByOption.get(selection.salesProductOptionId);
      if (!prices) continue;
      hasEvidence = true;
      if (prices.size !== 1) {
        plan.conflicts.push({
          salesProductId: evidence.product.id,
          channelAccountId: evidence.channelAccountId,
          reason: 'options_disagree',
          prices: [...prices].sort((left, right) => left - right),
        });
        optionConflict = true;
        break;
      }
      const [salePrice] = prices;
      const canonical = canonicalById.get(selection.salesProductOptionId);
      const current = selection.salePrice ?? canonical?.salePrice;
      if (current !== salePrice) optionPrices.push({ salesProductOptionId: selection.salesProductOptionId, salePrice: salePrice! });
    }
    if (optionConflict || !hasEvidence || optionPrices.length === 0) {
      if (!optionConflict && hasEvidence) plan.unchanged += 1;
      continue;
    }

    plan.writes.push({
      salesProductId: evidence.product.id,
      channelAccountId: evidence.channelAccountId,
      salePrice: optionPrices[0]!.salePrice,
      targetId: target.id,
      expectedVersion: target.version,
      optionPrices,
    });
  }
  return plan;
}
