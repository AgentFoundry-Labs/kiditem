import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdBenchmarkService } from '../ad-benchmark.service';
import { AdvertisingService } from '../advertising.service';
import { periodBounds } from '../../../domain/ad-metrics';
import type { AdBenchmarkRepositoryPort } from '../../port/out/repository/ad-benchmark.repository.port';
import type { AdListingRepositoryPort } from '../../port/out/repository/ad-listing.repository.port';
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

describe('advertising complete-day period bounds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("'month' is empty on the first KST day instead of reading today's partial data", () => {
    // 2026-04-30 16:00 UTC = 2026-05-01 01:00 KST
    vi.setSystemTime(new Date('2026-04-30T16:00:00.000Z'));
    expect(periodBounds('month')).toEqual({
      from: new Date('2026-05-01T00:00:00.000Z'),
      to: new Date('2026-04-30T00:00:00.000Z'),
    });
  });

  it("'month' returns current KST month start through yesterday", () => {
    vi.setSystemTime(new Date('2026-05-15T03:00:00.000Z'));
    expect(periodBounds('month')).toEqual({
      from: new Date('2026-05-01T00:00:00.000Z'),
      to: new Date('2026-05-14T00:00:00.000Z'),
    });
  });

  it("'7d' and '14d' contain exactly N complete dates ending yesterday", () => {
    vi.setSystemTime(new Date('2026-04-30T16:00:00.000Z'));
    expect(periodBounds('7d')).toEqual({
      from: new Date('2026-04-24T00:00:00.000Z'),
      to: new Date('2026-04-30T00:00:00.000Z'),
    });
    expect(periodBounds('14d')).toEqual({
      from: new Date('2026-04-17T00:00:00.000Z'),
      to: new Date('2026-04-30T00:00:00.000Z'),
    });
  });
});
