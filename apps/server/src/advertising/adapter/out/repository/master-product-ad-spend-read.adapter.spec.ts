import { describe, expect, it, vi } from 'vitest';
import { MasterProductAdSpendReadAdapter } from './master-product-ad-spend-read.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const COVERAGE = [{ startDate: new Date('2026-07-01T00:00:00.000Z'), endDate: new Date('2026-07-02T00:00:00.000Z') }];

function makeAdapter(input: { listings?: unknown[]; rows?: unknown[] } = {}) {
  const prisma = {
    channelListing: { findMany: vi.fn().mockResolvedValue(input.listings ?? []) },
    channelListingDailySnapshot: { findMany: vi.fn().mockResolvedValue(input.rows ?? []) },
  };
  const Adapter = MasterProductAdSpendReadAdapter as unknown as new (prisma: unknown) =>
    MasterProductAdSpendReadAdapter;
  return { adapter: new Adapter(prisma), prisma };
}

function row(listingId: string, date: string, adSpend: number) {
  return {
    listingId,
    businessDate: new Date(`${date}T00:00:00.000Z`),
    adSpend,
    adCoverageStatus: adSpend === 0 ? 'CONFIRMED_ZERO' : 'OBSERVED',
    adObservedAt: new Date('2026-07-03T01:00:00.000Z'),
  };
}

describe('MasterProductAdSpendReadAdapter', () => {
  it('adds listing-level daily facts once per listing without option double counting', async () => {
    const { adapter, prisma } = makeAdapter({
      listings: [{ id: 'listing-a', masterProductId: 'master-1' }, { id: 'listing-b', masterProductId: 'master-1' }],
      rows: [row('listing-a', '2026-07-01', 100), row('listing-b', '2026-07-01', 20), row('listing-a', '2026-07-02', 50), row('listing-b', '2026-07-02', 30)],
    });

    await expect(adapter.readDailyAdSpend({
      organizationId: ORGANIZATION_ID,
      requests: [{ masterProductId: 'master-1', coverage: COVERAGE }],
      asOfDate: new Date('2026-07-02T00:00:00.000Z'),
    })).resolves.toEqual([expect.objectContaining({
      masterProductId: 'master-1', status: 'OBSERVED',
      dailyFacts: [
        { businessDate: new Date('2026-07-01T00:00:00.000Z'), adSpend: 120 },
        { businessDate: new Date('2026-07-02T00:00:00.000Z'), adSpend: 80 },
      ],
    })]);
    expect(prisma.channelListingDailySnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: ORGANIZATION_ID, listingId: { in: ['listing-a', 'listing-b'] } }),
    }));
  });

  it('recognizes explicit all-zero facts but never converts a missing range into zero', async () => {
    const request = { masterProductId: 'master-1', coverage: COVERAGE };
    await expect(makeAdapter({
      listings: [{ id: 'listing-a', masterProductId: 'master-1' }],
      rows: [row('listing-a', '2026-07-01', 0), row('listing-a', '2026-07-02', 0)],
    }).adapter.readDailyAdSpend({ organizationId: ORGANIZATION_ID, requests: [request], asOfDate: new Date('2026-07-02T00:00:00.000Z') }))
      .resolves.toEqual([expect.objectContaining({ status: 'CONFIRMED_ZERO', dailyFacts: expect.any(Array) })]);

    await expect(makeAdapter({
      listings: [{ id: 'listing-a', masterProductId: 'master-1' }],
      rows: [],
    }).adapter.readDailyAdSpend({ organizationId: ORGANIZATION_ID, requests: [request], asOfDate: new Date('2026-07-02T00:00:00.000Z') }))
      .resolves.toEqual([expect.objectContaining({ status: 'MISSING', dailyFacts: [] })]);
  });

  it('does not accept a traffic-owned numeric zero as advertising evidence', async () => {
    const request = { masterProductId: 'master-1', coverage: COVERAGE };
    const { adapter, prisma } = makeAdapter({
      listings: [{ id: 'listing-a', masterProductId: 'master-1' }],
      rows: [],
    });

    await expect(adapter.readDailyAdSpend({
      organizationId: ORGANIZATION_ID,
      requests: [request],
      asOfDate: new Date('2026-07-02T00:00:00.000Z'),
    })).resolves.toEqual([
      expect.objectContaining({ status: 'MISSING', dailyFacts: [] }),
    ]);
    expect(prisma.channelListingDailySnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          adCoverageStatus: { in: ['OBSERVED', 'CONFIRMED_ZERO'] },
          adObservedAt: { not: null },
        }),
      }),
    );
  });

  it('marks gaps and cutoff mismatch stale instead of inventing daily zeroes', async () => {
    const request = { masterProductId: 'master-1', coverage: COVERAGE };
    await expect(makeAdapter({
      listings: [{ id: 'listing-a', masterProductId: 'master-1' }],
      rows: [row('listing-a', '2026-07-01', 10)],
    }).adapter.readDailyAdSpend({ organizationId: ORGANIZATION_ID, requests: [request], asOfDate: new Date('2026-07-02T00:00:00.000Z') }))
      .resolves.toEqual([expect.objectContaining({ status: 'STALE', dailyFacts: [] })]);

    await expect(makeAdapter({
      listings: [{ id: 'listing-a', masterProductId: 'master-1' }],
      rows: [row('listing-a', '2026-07-01', 10), row('listing-a', '2026-07-02', 10)],
    }).adapter.readDailyAdSpend({ organizationId: ORGANIZATION_ID, requests: [request], asOfDate: new Date('2026-07-03T00:00:00.000Z') }))
      .resolves.toEqual([expect.objectContaining({ status: 'STALE', dailyFacts: [] })]);
  });

  it('propagates an owner-repository failure so Finance can publish stale evidence', async () => {
    const { adapter, prisma } = makeAdapter();
    prisma.channelListing.findMany.mockRejectedValueOnce(new Error('advertising source unavailable'));
    await expect(adapter.readDailyAdSpend({
      organizationId: ORGANIZATION_ID,
      requests: [{ masterProductId: 'master-1', coverage: COVERAGE }],
      asOfDate: new Date('2026-07-02T00:00:00.000Z'),
    })).rejects.toThrow('advertising source unavailable');
  });
});
