import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdBenchmarkService } from '../ad-benchmark.service';
import { AdvertisingService } from '../advertising.service';
import { periodToDays } from '../ad-campaigns.service';

/**
 * H3a quality-review fix — period cutoffs in advertising read services must
 * anchor at KST (Asia/Seoul) midnight, not server-local midnight. Docker prod
 * runs UTC (`TZ` unset → defaults to UTC) so naive `setHours(0,0,0,0)` on
 * `new Date()` produces UTC midnight — 9 hours off from KST and sometimes
 * including/excluding a partial day.
 *
 * These tests pin a known clock at "2026-04-27 03:00 UTC" (= 2026-04-27 12:00 KST)
 * and assert the cutoff passed to prisma is the UTC instant that represents
 * KST midnight on the cutoff day. With UTC midnight that would be
 * `2026-04-27T00:00:00Z`; with KST midnight it is `2026-04-26T15:00:00Z`.
 */
describe('Advertising read services — KST cutoff', () => {
  const FIXED_NOW = new Date('2026-04-27T03:00:00Z'); // 2026-04-27 12:00 KST

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('AdBenchmarkService.getDiagnosis 30-day cutoff', () => {
    it('uses KST midnight (UTC-9 → 15:00 prev UTC day), not UTC midnight', async () => {
      const prisma: any = {
        channelListingDailySnapshot: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: {
              adSpend: 0,
              adImpressions: 0,
              adClicks: 0,
              adConversions: 0,
              adRevenue: 0,
            },
          }),
          groupBy: vi.fn().mockResolvedValue([]),
        },
        channelListing: { findMany: vi.fn().mockResolvedValue([]) },
      };
      const adConfig: any = {
        getConfig: vi.fn().mockResolvedValue({
          benchmark: {
            roas: { avg: 300 },
            ctr: { avg: 1 },
            cvr: { avg: 5 },
          },
        }),
      };
      const service = new AdBenchmarkService(prisma, adConfig);

      await service.getDiagnosis('company-1');

      // Inclusive 30 businessDates = today plus 29 prior KST dates.
      // KST midnight cutoff = 2026-03-29T00:00 KST = 2026-03-28T15:00:00.000Z.
      const expectedKstCutoff = new Date('2026-03-28T15:00:00.000Z');
      // UTC midnight equivalent (the WRONG value before the fix) would be
      // 2026-03-28T00:00:00.000Z. Assert we are using the KST instant.
      const aggregateCall =
        prisma.channelListingDailySnapshot.aggregate.mock.calls[0][0];
      expect(aggregateCall.where.businessDate.gte).toEqual(expectedKstCutoff);
      expect(
        aggregateCall.where.businessDate.gte.toISOString(),
      ).not.toBe('2026-03-28T00:00:00.000Z');
    });
  });

  describe('AdvertisingService.buildListingItems 30-day cutoff', () => {
    it('uses KST midnight cutoff so a partial KST day is not silently dropped', async () => {
      const prisma: any = {
        channelListingDailySnapshot: {
          groupBy: vi.fn().mockResolvedValue([]),
        },
        channelListing: { findMany: vi.fn().mockResolvedValue([]) },
      };
      const adConfig: any = {
        getConfig: vi.fn().mockResolvedValue({}),
      };
      const service = new AdvertisingService(prisma, adConfig);

      await service.getHubData('company-1');

      const expectedKstCutoff = new Date('2026-03-28T15:00:00.000Z');
      const groupByCall =
        prisma.channelListingDailySnapshot.groupBy.mock.calls[0][0];
      expect(groupByCall.where.businessDate.gte).toEqual(expectedKstCutoff);
    });
  });
});

/**
 * H3a residual fix — `periodToDays('month')` must derive day-of-month from
 * the KST view of `now`, not the server-local view. Pin a UTC moment that
 * sits on the *previous* UTC day vs. KST: 2026-04-30T16:00:00Z is
 * 2026-05-01T01:00:00 KST. UTC day-of-month = 30, KST day-of-month = 1.
 * Pre-fix: returns 30 (would request a 30-day month-to-date window crossing
 * into April). Post-fix: returns 1.
 */
describe('AdCampaignsService.periodToDays — KST month cutoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("'month' returns KST day-of-month (= 1), not UTC day-of-month (= 30)", () => {
    // 2026-04-30 16:00 UTC = 2026-05-01 01:00 KST
    vi.setSystemTime(new Date('2026-04-30T16:00:00.000Z'));
    expect(periodToDays('month')).toBe(1);
  });

  it("'month' on a same-day-in-both-zones moment still returns the KST day", () => {
    // 2026-04-15 03:00 UTC = 2026-04-15 12:00 KST → both day-of-month = 15
    vi.setSystemTime(new Date('2026-04-15T03:00:00.000Z'));
    expect(periodToDays('month')).toBe(15);
  });

  it("'7d' / '14d' branches are unchanged by the KST shift", () => {
    vi.setSystemTime(new Date('2026-04-30T16:00:00.000Z'));
    expect(periodToDays('7d')).toBe(7);
    expect(periodToDays('14d')).toBe(14);
  });
});
