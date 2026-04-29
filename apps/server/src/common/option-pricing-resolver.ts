const CNY_TO_KRW_RATE = 190;

/**
 * Resolver 입력: pricing resolve 에 필요한 최소 필드 (nested-only, v2 spec §4.4).
 *
 * 모든 caller 는 `{ option: { costPrice, costCny, sellPrice, commissionRate,
 * shippingCost, otherCost } }` 형태로 전달한다. flat legacy shape 은 제거됐으며
 * (A-10) missed caller 는 compile-time error 로 차단된다 (R-10 silent-zero 방지).
 */
interface ResolvePricingInput {
  option: {
    costPrice?: number | null;
    costCny?: unknown; // Decimal or number
    sellPrice?: number | null;
    commissionRate?: unknown; // Decimal or number
    shippingCost?: number | null;
    otherCost?: number | null;
  };
}

interface ResolvedPricing {
  costPrice: number;
  sellPrice: number;
  commissionRate: number;
  shippingCost: number;
  otherCost: number;
  /** costPrice 가 실제 데이터 없이 0 으로 fallback 된 경우 true */
  isCostMissing: boolean;
}

/**
 * ProductOption pricing resolve — nested-only (v2 §4.4).
 *
 * costPrice: option.costPrice ?? Math.round(costCny * 190) ?? 0 (KRW)
 * sellPrice: option.sellPrice ?? 0
 * commissionRate: Number(option.commissionRate) ?? 0
 * shippingCost: option.shippingCost ?? 0
 * otherCost: option.otherCost ?? 0
 */
export function resolvePricing(p: ResolvePricingInput): ResolvedPricing {
  const o = p.option;
  const hasCost = o.costPrice != null || o.costCny != null;
  const costPrice =
    o.costPrice ??
    (o.costCny != null ? Math.round(Number(o.costCny) * CNY_TO_KRW_RATE) : 0);
  const sellPrice = o.sellPrice ?? 0;
  const commissionRate = o.commissionRate != null ? Number(o.commissionRate) : 0;
  const shippingCost = o.shippingCost ?? 0;
  const otherCost = o.otherCost ?? 0;
  return {
    costPrice,
    sellPrice,
    commissionRate,
    shippingCost,
    otherCost,
    isCostMissing: !hasCost,
  };
}
