import { describe, it, expect } from 'vitest';
import {
  recomputeRoas,
  recomputeCtr,
  recomputeCvr,
} from '../ratio-recompute';

describe('ratio-recompute (H3)', () => {
  describe('recomputeRoas', () => {
    it('returns SUM(revenue) / SUM(spend) * 100 with 2-decimal rounding', () => {
      // 30000 / 10000 * 100 = 300
      expect(recomputeRoas(30000, 10000)).toBe(300);
      // 12345 / 6789 * 100 ≈ 181.8382 → 181.84
      expect(recomputeRoas(12345, 6789)).toBe(181.84);
    });

    it('returns null when spend is 0', () => {
      expect(recomputeRoas(0, 0)).toBeNull();
      expect(recomputeRoas(50000, 0)).toBeNull();
    });

    it('returns null for NaN / negative / non-finite inputs', () => {
      expect(recomputeRoas(Number.NaN, 100)).toBeNull();
      expect(recomputeRoas(100, Number.NaN)).toBeNull();
      expect(recomputeRoas(100, -1)).toBeNull();
      expect(recomputeRoas(Number.POSITIVE_INFINITY, 100)).toBeNull();
    });

    it('correctly recomputes from period sums (disagrees with per-row averaged ratio)', () => {
      // Three days with daily revenue + spend that average ROAS very
      // differently from the period-aggregated ROAS.
      // Day 1: revenue=10000 spend=10000  → daily ROAS = 100
      // Day 2: revenue=10000 spend=1000   → daily ROAS = 1000
      // Day 3: revenue=0     spend=1000   → daily ROAS = 0
      // SUM-based ROAS = (10000+10000+0) / (10000+1000+1000) * 100 = 166.67
      const sumRevenue = 10000 + 10000 + 0;
      const sumSpend = 10000 + 1000 + 1000;
      expect(recomputeRoas(sumRevenue, sumSpend)).toBe(166.67);
    });
  });

  describe('recomputeCtr', () => {
    it('returns SUM(clicks) / SUM(impressions) * 100', () => {
      expect(recomputeCtr(50, 1000)).toBe(5);
      expect(recomputeCtr(123, 9876)).toBe(1.25);
    });

    it('returns null when impressions is 0', () => {
      expect(recomputeCtr(0, 0)).toBeNull();
      expect(recomputeCtr(10, 0)).toBeNull();
    });
  });

  describe('recomputeCvr', () => {
    it('returns SUM(conversions) / SUM(clicks) * 100', () => {
      expect(recomputeCvr(5, 100)).toBe(5);
      expect(recomputeCvr(7, 123)).toBe(5.69);
    });

    it('returns null when clicks is 0', () => {
      expect(recomputeCvr(0, 0)).toBeNull();
      expect(recomputeCvr(5, 0)).toBeNull();
    });
  });
});
