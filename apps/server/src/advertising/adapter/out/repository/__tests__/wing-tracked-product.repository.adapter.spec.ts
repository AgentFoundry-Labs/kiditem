import { describe, expect, it, vi } from 'vitest';
import { WingTrackedProductRepositoryAdapter } from '../wing-tracked-product.repository.adapter';
import { upsertWingTrackedProductSnapshots } from '../wing-tracked-product-snapshot.persistence';
import { currentBusinessDate } from '../../../../domain/business-date';

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

describe('upsertWingTrackedProductSnapshots', () => {
  it('replaces a terminal capture with bounded set-based writes', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'tracked-1', productId: 'wing-1' },
      { id: 'tracked-2', productId: 'wing-2' },
    ]);
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const capturedAt = new Date('2026-08-14T03:15:00.000Z');

    await expect(upsertWingTrackedProductSnapshots({
      coupangWingTrackedProduct: { findMany, updateMany },
      coupangWingTrackedProductDailySnapshot: { deleteMany, createMany },
    } as never, [
      {
        productId: 'wing-1',
        businessDate: new Date('2026-08-14T00:00:00.000Z'),
        sourceKeyword: 'A Pencil',
        capturedAt,
        salePriceKrw: 1200,
        ratingCount: 3,
        ratingAverage: 4.5,
        pvLast28Day: 10,
        salesLast28d: 2,
        estimatedRevenue28d: 2400,
        conversionRate28d: 0.2,
      },
      {
        productId: 'wing-2',
        businessDate: new Date('2026-08-14T00:00:00.000Z'),
        sourceKeyword: 'Other Pencil',
        capturedAt,
        salePriceKrw: 2300,
        ratingCount: 4,
        ratingAverage: 4.7,
        pvLast28Day: 12,
        salesLast28d: 3,
        estimatedRevenue28d: 6900,
        conversionRate28d: 0.25,
      },
    ], ORGANIZATION_ID)).resolves.toEqual({ captured: 2, ignored: 0 });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { trackedProductId: 'tracked-1', businessDate: new Date('2026-08-14T00:00:00.000Z') },
          { trackedProductId: 'tracked-2', businessDate: new Date('2026-08-14T00:00:00.000Z') },
        ],
      },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ trackedProductId: 'tracked-1', capturedAt, salePriceKrw: 1200 }),
        expect.objectContaining({ trackedProductId: 'tracked-2', capturedAt, salePriceKrw: 2300 }),
      ]),
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['tracked-1', 'tracked-2'] }, organizationId: ORGANIZATION_ID, enabled: true },
      data: { lastCapturedAt: capturedAt },
    });
  });
});
