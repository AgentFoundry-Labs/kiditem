import { describe, expect, it, vi } from 'vitest';
import type {
  WingTrackedProductRepositoryPort,
  WingTrackedSnapshotRow,
} from '../../port/out/repository/wing-tracked-product.repository.port';
import { WingTrackedProductService } from '../wing-tracked-product.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function point(trackedProductId: string): WingTrackedSnapshotRow {
  return {
    trackedProductId,
    businessDate: new Date('2026-08-14T00:00:00.000Z'),
    salePriceKrw: 12_000,
    ratingCount: 8,
    ratingAverage: 4.5,
    pvLast28Day: 200,
    salesLast28d: 12,
    estimatedRevenue28d: 144_000,
    conversionRate28d: 0.06,
    capturedAt: new Date('2026-08-14T03:00:00.000Z'),
  };
}

function makeRepository() {
  return {
    list: vi.fn(),
    registerWithInitialSnapshot: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    findHistory: vi.fn(),
    findBulkHistory: vi.fn(),
    listEnabledTargets: vi.fn(),
    publishOperationSnapshots: vi.fn(),
  } satisfies Record<keyof WingTrackedProductRepositoryPort, ReturnType<typeof vi.fn>>;
}

describe('WingTrackedProductService.getBulkHistory', () => {
  it('uses one repository call scoped only by the authenticated organization and days', async () => {
    const repo = makeRepository();
    repo.findBulkHistory.mockResolvedValue([
      {
        trackedProductId: '22222222-2222-4222-8222-222222222222',
        productName: '조직 상품',
        points: [point('22222222-2222-4222-8222-222222222222')],
      },
    ]);
    const service = new WingTrackedProductService(repo);

    await expect(service.getBulkHistory(30, ORGANIZATION_ID)).resolves.toEqual({
      items: [
        {
          trackedProductId: '22222222-2222-4222-8222-222222222222',
          productName: '조직 상품',
          points: [point('22222222-2222-4222-8222-222222222222')],
        },
      ],
    });

    expect(repo.findBulkHistory).toHaveBeenCalledTimes(1);
    expect(repo.findBulkHistory).toHaveBeenCalledWith(ORGANIZATION_ID, 30);
    expect(repo.list).not.toHaveBeenCalled();
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.findHistory).not.toHaveBeenCalled();
  });
});

describe('WingTrackedProductService tracker registration', () => {
  it('registers the tracker and its initial snapshot through one atomic owner operation', async () => {
    const repo = makeRepository();
    const tracker = {
      id: '22222222-2222-4222-8222-222222222222',
      organizationId: ORGANIZATION_ID,
      productId: 'wing-1',
      itemId: null,
      vendorItemId: null,
      productName: 'Wing product',
      imagePath: null,
      brandName: null,
      categoryHierarchy: null,
      sourceKeyword: 'A Pencil',
      enabled: true,
      lastCapturedAt: new Date('2026-08-14T03:00:00.000Z'),
      createdAt: new Date('2026-08-14T03:00:00.000Z'),
      updatedAt: new Date('2026-08-14T03:00:00.000Z'),
    };
    repo.registerWithInitialSnapshot.mockResolvedValue(tracker);
    repo.list.mockResolvedValue([{ ...tracker, latestSnapshot: point(tracker.id) }]);
    const service = new WingTrackedProductService(repo);

    await expect(service.addTracker({
      productId: 'wing-1',
      productName: 'Wing product',
      sourceKeyword: 'A Pencil',
      salePriceKrw: 12_000,
      ratingCount: 8,
      ratingAverage: 4.5,
      pvLast28Day: 200,
      salesLast28d: 12,
      estimatedRevenue28d: 144_000,
      conversionRate28d: 0.06,
    }, ORGANIZATION_ID)).resolves.toMatchObject({
      id: tracker.id,
      latestSnapshot: { salePriceKrw: 12_000 },
    });

    expect(repo.registerWithInitialSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      productId: 'wing-1',
      sourceKeyword: 'A Pencil',
      salePriceKrw: 12_000,
    }), ORGANIZATION_ID);
  });
});
