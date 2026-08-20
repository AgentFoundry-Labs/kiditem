import { describe, expect, it, vi } from 'vitest';
import { WingTrackedProductRepositoryAdapter } from '../wing-tracked-product.repository.adapter';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORGANIZATION_ID = '99999999-9999-4999-8999-999999999999';

describe('WingTrackedProductRepositoryAdapter.findBulkHistory', () => {
  it('performs one organization-bounded query ordered by tracked product and business date', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        trackedProductId: '22222222-2222-4222-8222-222222222222',
        businessDate: new Date('2026-08-13T00:00:00.000Z'),
        salePriceKrw: 10_000,
        ratingCount: 1,
        ratingAverage: null,
        pvLast28Day: null,
        salesLast28d: null,
        estimatedRevenue28d: null,
        conversionRate28d: null,
        capturedAt: new Date('2026-08-13T01:00:00.000Z'),
        trackedProduct: { productName: '상품 A' },
      },
      {
        trackedProductId: '22222222-2222-4222-8222-222222222222',
        businessDate: new Date('2026-08-14T00:00:00.000Z'),
        salePriceKrw: 11_000,
        ratingCount: 2,
        ratingAverage: null,
        pvLast28Day: null,
        salesLast28d: null,
        estimatedRevenue28d: null,
        conversionRate28d: null,
        capturedAt: new Date('2026-08-14T01:00:00.000Z'),
        trackedProduct: { productName: '상품 A' },
      },
    ]);
    const adapter = new WingTrackedProductRepositoryAdapter({
      coupangWingTrackedProductDailySnapshot: { findMany },
    } as never);

    const result = await adapter.findBulkHistory(ORGANIZATION_ID, 30);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        businessDate: { gte: expect.any(Date) },
      },
      orderBy: [
        { trackedProductId: 'asc' },
        { businessDate: 'asc' },
      ],
      include: {
        trackedProduct: { select: { productName: true } },
      },
    });
    expect(JSON.stringify(findMany.mock.calls)).not.toContain(OTHER_ORGANIZATION_ID);
    expect(result).toMatchObject([
      {
        trackedProductId: '22222222-2222-4222-8222-222222222222',
        productName: '상품 A',
        points: [
          { businessDate: new Date('2026-08-13T00:00:00.000Z') },
          { businessDate: new Date('2026-08-14T00:00:00.000Z') },
        ],
      },
    ]);
  });
});

describe('WingTrackedProductRepositoryAdapter.upsertSnapshotsByProductIdInAttempt', () => {
  it('uses only the opaque transaction and filters the exact organization-enabled tracker set', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'tracker-1', productId: 'wing-1' }]);
    const upsert = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      coupangWingTrackedProduct: { findMany, updateMany },
      coupangWingTrackedProductDailySnapshot: { upsert },
    };
    const defaultFindMany = vi.fn();
    const adapter = new WingTrackedProductRepositoryAdapter({
      coupangWingTrackedProduct: { findMany: defaultFindMany },
    } as never);
    const capturedAt = new Date('2026-08-14T03:00:00.000Z');
    const rows = ['wing-1', 'wing-disabled'].map((productId) => ({
      productId,
      businessDate: new Date('2026-08-14T00:00:00.000Z'),
      sourceKeyword: 'A Pencil',
      capturedAt,
      salePriceKrw: null,
      ratingCount: null,
      ratingAverage: null,
      pvLast28Day: null,
      salesLast28d: null,
      estimatedRevenue28d: null,
      conversionRate28d: null,
    }));

    await expect(adapter.upsertSnapshotsByProductIdInAttempt(
      transaction as never,
      rows,
      ORGANIZATION_ID,
    )).resolves.toEqual({ captured: 1, ignored: 1 });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        enabled: true,
        productId: { in: ['wing-1', 'wing-disabled'] },
      },
      select: { id: true, productId: true },
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['tracker-1'] }, organizationId: ORGANIZATION_ID, enabled: true },
      data: { lastCapturedAt: capturedAt },
    });
    expect(defaultFindMany).not.toHaveBeenCalled();
  });
});
