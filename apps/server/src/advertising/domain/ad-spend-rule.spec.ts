import { describe, expect, it } from 'vitest';
import { AD_VAT_RATE, adConversions, performanceAdSpend, profitAdCost } from './ad-spend-rule';

describe('ad-spend-rule (KID-368·372)', () => {
  it('이익 광고비 = (청구액 + 계정 조정) × 1.1, 원 단위로 마지막에 한 번 반올림', () => {
    expect(AD_VAT_RATE).toBe(0.1);
    expect(profitAdCost({ billedSpend: 1000 })).toBe(1100);
    expect(profitAdCost({ billedSpend: 1000, adjustment: -100 })).toBe(990);
    // 1234.5 + 0 → 1357.95 → 1358 (행마다 반올림했다면 1234 × 1.1 = 1357.4 → 1357)
    expect(profitAdCost({ billedSpend: 1234, adjustment: 0.5 })).toBe(1358);
    expect(profitAdCost({ billedSpend: 0, adjustment: 0 })).toBe(0);
  });

  it('성과 광고비는 집행액 그대로, 전환은 주문수', () => {
    expect(performanceAdSpend(777)).toBe(777);
    expect(adConversions({ orders: 3 })).toBe(3);
  });
});
