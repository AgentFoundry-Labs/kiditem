import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdBenchmarkService } from '../ad-benchmark.service';
import { AdvertisingService } from '../advertising.service';

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

      // KST midnight 30 days ago = (today KST midnight 2026-04-27T00:00 KST)
      //   - 30 days = 2026-03-28T00:00 KST = 2026-03-27T15:00:00.000Z
      const expectedKstCutoff = new Date('2026-03-27T15:00:00.000Z');
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

      const expectedKstCutoff = new Date('2026-03-27T15:00:00.000Z');
      const groupByCall =
        prisma.channelListingDailySnapshot.groupBy.mock.calls[0][0];
      expect(groupByCall.where.businessDate.gte).toEqual(expectedKstCutoff);
    });
  });
});
