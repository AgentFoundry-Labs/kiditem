import { describe, it, expect } from 'vitest';
import { getCurrentPeriod, getWeekRange, toListingSummary } from '../../util/ad-strategy-helpers';
import type { HydratedListing } from '../../types';

describe('ad-strategy-helpers', () => {
  describe('getCurrentPeriod', () => {
    it('returns year + 1-indexed month from injected Date', () => {
      const fixed = new Date(2026, 3, 19);
      expect(getCurrentPeriod(fixed)).toEqual({ year: 2026, month: 4 });
    });

    it('uses current Date when no arg', () => {
      const result = getCurrentPeriod();
      const now = new Date();
      expect(result.year).toBe(now.getFullYear());
      expect(result.month).toBe(now.getMonth() + 1);
    });
  });

  describe('getWeekRange', () => {
    it('7d returns 7-day range ending today', () => {
      const { start, end } = getWeekRange('7d');
      const diffDays = Math.round((new Date(end).getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(7);
    });

    it('14d returns 14-day range', () => {
      const { start, end } = getWeekRange('14d');
      const diffDays = Math.round((new Date(end).getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(14);
    });

    it('month returns from 1st of current month to today', () => {
      const { start } = getWeekRange('month');
      expect(start.endsWith('-01')).toBe(true);
    });
  });

  describe('toListingSummary', () => {
    it('strips ad/inventory fields, returns AdListingSummary shape with option:null', () => {
      const listing: HydratedListing = {
        id: 'L1',
        externalId: 'EXT-1',
        channelName: '쿠팡상품',
        masterProduct: { id: 'M1', code: 'M-00001', name: 'Test', abcGrade: 'A', adTier: '1차', healthScore: 80 },
        primaryOption: null,
      };
      const result = toListingSummary(listing);
      expect(result).toEqual({
        listingId: 'L1',
        externalId: 'EXT-1',
        channelName: '쿠팡상품',
        masterProduct: { id: 'M1', code: 'M-00001', name: 'Test' },
        option: null,
      });
    });
  });
});
