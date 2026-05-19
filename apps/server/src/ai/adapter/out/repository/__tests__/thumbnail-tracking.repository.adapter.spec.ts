import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ThumbnailTrackingRepositoryAdapter } from '../thumbnail-tracking.repository.adapter';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const TRACKING_ID = '22222222-2222-4222-8222-222222222222';
const LISTING_ID = '33333333-3333-4333-8333-333333333333';
const GENERATION_ID = '44444444-4444-4444-8444-444444444444';

function makeRow() {
  return {
    id: TRACKING_ID,
    organizationId: ORGANIZATION_ID,
    listingId: LISTING_ID,
    generationId: GENERATION_ID,
    originalGrade: 'A',
    originalScore: 91,
    appliedAt: new Date('2026-05-01T00:00:00.000Z'),
    status: 'tracking',
    ctrBefore: null,
    ctrAfter: null,
    reviewsBefore: null,
    reviewsAfter: null,
    salesBefore: null,
    salesAfter: null,
    listing: {
      id: LISTING_ID,
      master: { id: 'master-1', name: '테스트 상품' },
    },
  };
}

describe('ThumbnailTrackingRepositoryAdapter', () => {
  it('handles duplicate tracking creates inside the adapter', async () => {
    const existing = makeRow();
    const prisma = {
      thumbnailTracking: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(existing),
        create: vi.fn().mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        ),
      },
    };
    const repository = new ThumbnailTrackingRepositoryAdapter(prisma as never);

    await expect(repository.createTracking({
      organizationId: ORGANIZATION_ID,
      listingId: LISTING_ID,
      generationId: GENERATION_ID,
      originalGrade: 'A',
      originalScore: 91,
    })).resolves.toEqual({ created: false, row: existing });

    expect(prisma.thumbnailTracking.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: ORGANIZATION_ID,
        listingId: LISTING_ID,
        generationId: GENERATION_ID,
      },
    }));
  });

  it('updates metrics with organization scope and returns the included tracking row', async () => {
    const updated = makeRow();
    const prisma = {
      thumbnailTracking: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ ctrBefore: 1.2, ctrAfter: null })
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new ThumbnailTrackingRepositoryAdapter(prisma as never);

    await expect(repository.updateMetrics({
      id: TRACKING_ID,
      organizationId: ORGANIZATION_ID,
      metrics: { ctrAfter: 2.5 },
    })).resolves.toEqual(updated);

    expect(prisma.thumbnailTracking.updateMany).toHaveBeenCalledWith({
      where: { id: TRACKING_ID, organizationId: ORGANIZATION_ID },
      data: { ctrAfter: 2.5, status: 'measured' },
    });
  });

  it('upserts snapshots and optionally sets the sales baseline', async () => {
    const snapshot = {
      id: 'snapshot-1',
      trackingId: TRACKING_ID,
      capturedAt: new Date('2026-05-19T03:00:00.000Z'),
      capturedDate: new Date('2026-05-19T00:00:00.000Z'),
      unitsSold30d: 42,
      unitsSold7d: 11,
      revenueKrw: 123000,
      reviewCount: 18,
      ratingAvg: 4.7,
      scrapeStatus: 'ok',
      errorMessage: null,
    };
    const prisma = {
      thumbnailTrackingDailySnapshot: {
        upsert: vi.fn().mockResolvedValue(snapshot),
      },
      thumbnailTracking: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = new ThumbnailTrackingRepositoryAdapter(prisma as never);

    await expect(repository.upsertDailySnapshot({
      organizationId: ORGANIZATION_ID,
      trackingId: TRACKING_ID,
      capturedDate: new Date('2026-05-19T00:00:00.000Z'),
      unitsSold30d: 42,
      unitsSold7d: 11,
      revenueKrw: 123000,
      reviewCount: 18,
      ratingAvg: 4.7,
      rawCellTexts: ['쿠팡 상품명', '42'],
      scrapeStatus: 'ok',
      errorMessage: null,
      setSalesBefore: true,
    })).resolves.toEqual(snapshot);

    expect(prisma.thumbnailTracking.updateMany).toHaveBeenCalledWith({
      where: { id: TRACKING_ID, organizationId: ORGANIZATION_ID },
      data: { salesBefore: 42 },
    });
  });
});
