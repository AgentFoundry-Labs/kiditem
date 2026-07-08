/**
 * 쿠팡 로켓 등록 가격 계산.
 *
 * 규칙(사용자 확정):
 * - 소비자가 = 기본정보 판매가(salePrice).
 * - 소비자가 ≥ 10,000원: 단품 그대로 → 로켓 판매가 = 소비자가.
 * - 소비자가 < 10,000원: 묶음 → 로켓 판매가 = 소비자가 × 수량 × 80%.
 * - 쿠팡 공급가 = 로켓 판매가 × 65%.
 * - 마진율 = (공급가 − 원가) ÷ 공급가 × 100. (원가 = 단가 × 묶음 수량)
 * - 마진율 50% 이하면 경고로 따로 표시.
 */
export const ROCKET_BUNDLE_THRESHOLD = 10000;
export const ROCKET_SELLING_RATE = 0.8;
export const ROCKET_SUPPLY_RATE = 0.65;
export const ROCKET_MARGIN_WARN_RATE = 50;
/** 위안화 원가 → 원화 환산 기본 환율(option-pricing-resolver와 동일). */
export const CNY_TO_KRW_RATE = 190;

export interface RocketPricingInput {
  /** 소비자가 (KRW) */
  consumerPrice: number;
  /** 묶음 수량 (소비자가 만원 미만일 때만 적용) */
  quantity: number;
  /** 단가 원가 (KRW) */
  unitCost: number;
}

export interface RocketPricing {
  /** 소비자가가 입력되어 계산 가능한지 */
  hasConsumerPrice: boolean;
  /** 소비자가 < 만원 → 묶음 계산 적용 */
  bundled: boolean;
  /** 마진/공급가 계산에 실제 적용된 수량 (단품이면 1) */
  effectiveQuantity: number;
  /** 쿠팡 로켓 판매가 */
  rocketSellingPrice: number;
  /** 쿠팡 공급가 */
  supplyPrice: number;
  /** 묶음 원가 (단가 × 적용 수량) */
  bundleCost: number;
  /** 원가가 입력되어 마진 계산 가능한지 */
  hasCost: boolean;
  /** 마진율 % (계산 불가 시 null) */
  marginRate: number | null;
  /** 마진율 50% 이하 경고 */
  marginBelowThreshold: boolean;
}

function positiveNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** 위안화 원가를 원화 단가로 환산(반올림). */
export function unitCostFromCostCny(
  costCny: number | null | undefined,
  rate: number = CNY_TO_KRW_RATE,
): number {
  const cny = positiveNumber(costCny ?? 0);
  return cny > 0 ? Math.round(cny * rate) : 0;
}

export function computeRocketPricing({
  consumerPrice,
  quantity,
  unitCost,
}: RocketPricingInput): RocketPricing {
  const price = positiveNumber(consumerPrice);
  const qty = Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1;
  const cost = positiveNumber(unitCost);

  const hasConsumerPrice = price > 0;
  const bundled = hasConsumerPrice && price < ROCKET_BUNDLE_THRESHOLD;
  const effectiveQuantity = bundled ? Math.max(1, qty) : 1;

  const rocketSellingPrice = hasConsumerPrice
    ? Math.round(bundled ? price * effectiveQuantity * ROCKET_SELLING_RATE : price)
    : 0;
  const supplyPrice = Math.round(rocketSellingPrice * ROCKET_SUPPLY_RATE);
  const bundleCost = Math.round(cost * effectiveQuantity);
  const hasCost = cost > 0;

  const marginRate =
    supplyPrice > 0 && hasCost
      ? ((supplyPrice - bundleCost) / supplyPrice) * 100
      : null;
  const marginBelowThreshold =
    marginRate !== null && marginRate <= ROCKET_MARGIN_WARN_RATE;

  return {
    hasConsumerPrice,
    bundled,
    effectiveQuantity,
    rocketSellingPrice,
    supplyPrice,
    bundleCost,
    hasCost,
    marginRate,
    marginBelowThreshold,
  };
}
