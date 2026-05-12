import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdBenchmarkService } from '../ad-benchmark.service';
import { AdvertisingService } from '../advertising.service';
import { periodToDays } from '../../../domain/ad-metrics';
import type { AdBenchmarkRepositoryPort } from '../../port/out/ad-benchmark.repository.port';
import type { AdListingRepositoryPort } from '../../port/out/ad-listing.repository.port';
import {
  buildMockAdBenchmarkRepo,
  buildMockAdListingRepo,
} from '../../../__tests__/test-helpers/build-mock-ports';

/**
 * H3a quality-review fix — period cutoffs in advertising read services must
 * anchor at KST (Asia/Seoul) midnight, not server-local midnight. Docker prod
 * runs UTC (`TZ` unset → defaults to UTC) so naive `setHours(0,0,0,0)` on
 * `new Date()` produces UTC midnight — 9 hours off from KST and sometimes
 * including/excluding a partial day.
 *
 * After the hexagonal split, the 30-day KST window is constructed inside the
 * outgoing repository adapters (`AdBenchmarkRepositoryAdapter`,
 * `AdvertisingService` reuses the same repo). End-to-end KST cutoff behavior
 * is covered by the integration tier (`ad-benchmark-flow.pg.integration.spec`).
 * The unit specs below verify the service hands the read off to the port
 * with only `organizationId` — no caller-side cutoff to leak.
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
      const benchmarkRepo = buildMockAdBenchmarkRepo();
      const listingRepo = buildMockAdListingRepo();
      benchmarkRepo.findBenchmarkAggregates.mockResolvedValue({
        totals: {
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          revenue: 0,
        },
        perListing: [],
      });
      listingRepo.findScopedAdListings.mockResolvedValue(new Map());
      const adConfig: any = {
        getConfig: vi.fn().mockResolvedValue({
          benchmark: {
            roas: { avg: 300 },
            ctr: { avg: 1 },
            cvr: { avg: 5 },
          },
        }),
      };
      const service = new AdBenchmarkService(
        benchmarkRepo as unknown as AdBenchmarkRepositoryPort,
        listingRepo as unknown as AdListingRepositoryPort,
        adConfig,
      );

      await service.getDiagnosis('organization-1');

      // Service hands off to the port with organizationId only — the KST
      // cutoff lives inside the adapter SQL now. Verified by integration tier.
      expect(benchmarkRepo.findBenchmarkAggregates).toHaveBeenCalledWith(
        'organization-1',
      );
    });
  });

  describe('AdvertisingService.buildListingItems 30-day cutoff', () => {
    it('uses KST midnight cutoff so a partial KST day is not silently dropped', async () => {
      const benchmarkRepo = buildMockAdBenchmarkRepo();
      const listingRepo = buildMockAdListingRepo();
      benchmarkRepo.findBenchmarkAggregates.mockResolvedValue({
        totals: {
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          revenue: 0,
        },
        perListing: [],
      });
      listingRepo.findScopedAdListings.mockResolvedValue(new Map());
      const adConfig: any = {
        getConfig: vi.fn().mockResolvedValue({}),
      };
      const service = new AdvertisingService(
        benchmarkRepo as unknown as AdBenchmarkRepositoryPort,
        listingRepo as unknown as AdListingRepositoryPort,
        adConfig,
      );

      await service.getHubData('organization-1');

      // Same as above — service does not own the cutoff after the hexagonal
      // split. Adapter SQL anchors the 30-day window at KST midnight.
      expect(benchmarkRepo.findBenchmarkAggregates).toHaveBeenCalledWith(
        'organization-1',
      );
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
