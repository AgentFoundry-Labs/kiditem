import { describe, expect, it } from 'vitest';
import { computeRocketPricing, unitCostFromCostCny } from './rocket-pricing';

describe('computeRocketPricing', () => {
  it('소비자가 만원 미만이면 소비자가 × 수량 × 80% 로 묶음 판매가를 계산한다', () => {
    const pricing = computeRocketPricing({ consumerPrice: 5000, quantity: 3, unitCost: 1000 });

    expect(pricing.bundled).toBe(true);
    expect(pricing.effectiveQuantity).toBe(3);
    // 5000 × 3 × 0.8
    expect(pricing.rocketSellingPrice).toBe(12000);
    // 12000 × 0.65
    expect(pricing.supplyPrice).toBe(7800);
    // 원가 1000 × 3 = 3000, (7800-3000)/7800 ≈ 61.5%
    expect(pricing.marginRate).toBeCloseTo(61.54, 1);
    expect(pricing.marginBelowThreshold).toBe(false);
  });

  it('소비자가 만원 이상이면 단품 그대로(판매가=소비자가, 공급가=×65%) 계산한다', () => {
    const pricing = computeRocketPricing({ consumerPrice: 12900, quantity: 5, unitCost: 4000 });

    expect(pricing.bundled).toBe(false);
    // 수량은 무시되고 단품(1개)로 계산
    expect(pricing.effectiveQuantity).toBe(1);
    expect(pricing.rocketSellingPrice).toBe(12900);
    expect(pricing.supplyPrice).toBe(8385);
    // (8385-4000)/8385 ≈ 52.3%
    expect(pricing.marginRate).toBeCloseTo(52.3, 1);
    expect(pricing.marginBelowThreshold).toBe(false);
  });

  it('마진율이 50% 이하면 경고 플래그를 세운다', () => {
    const pricing = computeRocketPricing({ consumerPrice: 12900, quantity: 1, unitCost: 5000 });

    // 공급가 8385, 원가 5000 → (8385-5000)/8385 ≈ 40.4%
    expect(pricing.marginRate).toBeLessThanOrEqual(50);
    expect(pricing.marginBelowThreshold).toBe(true);
  });

  it('소비자가가 없으면 계산하지 않는다', () => {
    const pricing = computeRocketPricing({ consumerPrice: 0, quantity: 2, unitCost: 1000 });

    expect(pricing.hasConsumerPrice).toBe(false);
    expect(pricing.rocketSellingPrice).toBe(0);
    expect(pricing.supplyPrice).toBe(0);
    expect(pricing.marginRate).toBeNull();
    expect(pricing.marginBelowThreshold).toBe(false);
  });

  it('원가가 없으면 마진율은 null 이다', () => {
    const pricing = computeRocketPricing({ consumerPrice: 5000, quantity: 2, unitCost: 0 });

    expect(pricing.hasCost).toBe(false);
    expect(pricing.marginRate).toBeNull();
  });
});

describe('unitCostFromCostCny', () => {
  it('위안화 원가를 기본 환율(190)로 원화 단가로 환산한다', () => {
    expect(unitCostFromCostCny(50)).toBe(9500);
    expect(unitCostFromCostCny(null)).toBe(0);
    expect(unitCostFromCostCny(0)).toBe(0);
  });
});
