import { describe, expect, it } from 'vitest';
import { scoreSourcingOpportunity } from '../opportunity-score';

describe('scoreSourcingOpportunity', () => {
  it('scores responsive new products higher than crowded stale products', () => {
    const responsive = scoreSourcingOpportunity({
      reviewGrowth7d: 42,
      rankDelta7d: -18,
      sellerCount: 4,
      priceKrw: 15900,
      estimatedLandedCostKrw: 5900,
      supplierConfidence: 0.86,
      riskFlags: [],
    });

    const crowded = scoreSourcingOpportunity({
      reviewGrowth7d: 2,
      rankDelta7d: 3,
      sellerCount: 38,
      priceKrw: 12900,
      estimatedLandedCostKrw: 8900,
      supplierConfidence: 0.48,
      riskFlags: ['brand_risk', 'low_margin'],
    });

    expect(responsive.totalScore).toBeGreaterThan(crowded.totalScore);
    expect(responsive.action).toBe('test_order');
    expect(crowded.action).toBe('reject');
  });
});
