import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPerListingMetrics } from '../../common/per-listing-profit';
import { ActionTaskService } from '../action-task.service';

vi.mock('../../common/per-listing-profit', () => ({
  buildPerListingMetrics: vi.fn(),
}));

const mockedBuildPerListingMetrics = vi.mocked(buildPerListingMetrics);

function makePrisma() {
  return {
    actionTask: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    inventory: {
      findMany: vi.fn(),
    },
    thumbnail: {
      count: vi.fn(),
    },
    masterProduct: {
      findMany: vi.fn(),
    },
  };
}

function makeTask(taskKey: string, priority: 'urgent' | 'high' | 'medium') {
  return {
    id: `task-${taskKey}`,
    companyId: 'company-1',
    taskKey,
    type: taskKey.startsWith('analyze') ? 'ai' : 'human',
    label: taskKey,
    detail: null,
    where: null,
    href: null,
    priority,
    status: 'pending',
    role: null,
    apiCall: null,
    result: null,
    notes: [],
    activityLog: [],
    date: new Date('2026-04-29T15:00:00.000Z'),
    createdAt: new Date('2026-04-30T00:00:00.000Z'),
    updatedAt: new Date('2026-04-30T00:00:00.000Z'),
  };
}

describe('ActionTaskService.getTasks', () => {
  let service: ActionTaskService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ActionTaskService(prisma as any);
    mockedBuildPerListingMetrics.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives warning seeds from live metrics with explicit company scope and KST month boundaries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T14:30:00.000Z'));

    mockedBuildPerListingMetrics.mockResolvedValue([
      {
        listingId: 'listing-minus',
        masterId: 'master-minus',
        masterName: '적자 상품',
        revenue: 10_000,
        adCost: 1_000,
        netProfit: -1_000,
        profitRate: -10,
      } as any,
      {
        listingId: 'listing-high-ad',
        masterId: 'master-high-ad',
        masterName: '광고 과다 상품',
        revenue: 10_000,
        adCost: 2_500,
        netProfit: 500,
        profitRate: 5,
      } as any,
      {
        listingId: 'listing-low-profit',
        masterId: 'master-low-profit',
        masterName: '저이익 상품',
        revenue: 10_000,
        adCost: 500,
        netProfit: 200,
        profitRate: 2,
      } as any,
    ]);
    prisma.inventory.findMany
      .mockResolvedValueOnce([{ currentStock: 2, reorderPoint: 5 }])
      .mockResolvedValueOnce([
        {
          optionId: 'option-stock',
          currentStock: 2,
          reorderPoint: 5,
          option: {
            master: {
              id: 'master-stock',
              name: '재고 부족 상품',
            },
          },
        },
      ]);
    prisma.thumbnail.count.mockResolvedValue(2);
    prisma.masterProduct.findMany.mockResolvedValue([
      { listings: [{ _count: { reviews: 3 } }] },
    ]);
    prisma.actionTask.findMany.mockResolvedValue([
      makeTask('h-reorder', 'high'),
      makeTask('h-ad-bid', 'urgent'),
      makeTask('h-minus-ad-stop', 'urgent'),
    ]);

    const result = await service.getTasks('company-1');

    expect(mockedBuildPerListingMetrics).toHaveBeenCalledWith(
      prisma as any,
      'company-1',
      new Date('2026-03-31T15:00:00.000Z'),
      new Date('2026-04-30T15:00:00.000Z'),
    );
    expect(prisma.inventory.findMany).toHaveBeenNthCalledWith(1, {
      where: { companyId: 'company-1', currentStock: { gt: 0 } },
      select: { currentStock: true, reorderPoint: true },
    });
    expect(prisma.thumbnail.count).toHaveBeenCalledWith({
      where: { companyId: 'company-1', ctr: { gt: 0, lt: 1.5 } },
    });
    expect(prisma.masterProduct.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1', isDeleted: false, abcGrade: 'A' },
      include: {
        listings: {
          where: { companyId: 'company-1', isDeleted: false },
          select: { _count: { select: { reviews: true } } },
        },
      },
    });

    const seededTaskKeys = prisma.actionTask.upsert.mock.calls.map(
      ([call]) => call.where.companyId_taskKey_date.taskKey,
    );
    expect(seededTaskKeys).toEqual(
      expect.arrayContaining([
        'h-ad-bid',
        'h-minus-ad-stop',
        'h-minus-price',
        'h-reorder',
        'h-ad-rate',
        'h-low-profit',
        'h-thumbnail',
        'h-review',
        'h-price-reset',
        'analyze-deficit',
        'analyze-ad',
        'analyze-stock',
      ]),
    );
    expect(
      prisma.actionTask.upsert.mock.calls.every(
        ([call]) => call.where.companyId_taskKey_date.companyId === 'company-1',
      ),
    ).toBe(true);

    expect(result.map((task) => task.taskKey)).toEqual([
      'h-ad-bid',
      'h-minus-ad-stop',
      'h-reorder',
    ]);
    expect(result[0].relatedProducts).toEqual([
      {
        id: 'master-high-ad',
        name: '광고 과다 상품',
        metric: '광고비율',
        value: '25%',
      },
    ]);
    expect(result[1].relatedProducts).toEqual([
      {
        id: 'master-minus',
        name: '적자 상품',
        metric: '이익률',
        value: '-10%',
      },
    ]);
    expect(result[2].relatedProducts).toEqual([
      {
        id: 'master-stock',
        name: '재고 부족 상품',
        metric: '재고',
        value: '2개 (기준 5)',
      },
    ]);
  });

  it('keeps reorder related products even when current-month live metrics are empty', async () => {
    mockedBuildPerListingMetrics.mockResolvedValue([]);
    prisma.inventory.findMany
      .mockResolvedValueOnce([{ currentStock: 1, reorderPoint: 3 }])
      .mockResolvedValueOnce([
        {
          optionId: 'option-stock-only',
          currentStock: 1,
          reorderPoint: 3,
          option: {
            master: {
              id: 'master-stock-only',
              name: '재고 전용 상품',
            },
          },
        },
      ]);
    prisma.thumbnail.count.mockResolvedValue(0);
    prisma.masterProduct.findMany.mockResolvedValue([]);
    prisma.actionTask.findMany.mockResolvedValue([
      makeTask('analyze-stock', 'high'),
      makeTask('h-reorder', 'high'),
    ]);

    const result = await service.getTasks('company-1');

    const seededTaskKeys = prisma.actionTask.upsert.mock.calls.map(
      ([call]) => call.where.companyId_taskKey_date.taskKey,
    );
    expect(seededTaskKeys).toEqual(
      expect.arrayContaining([
        'h-reorder',
        'analyze-stock',
        'h-ad-csv',
        'recalc-grade',
        'analyze-ad-rules',
        'analyze-category',
      ]),
    );
    expect(seededTaskKeys).not.toContain('h-minus-ad-stop');
    expect(seededTaskKeys).not.toContain('h-ad-bid');

    const reorderTask = result.find((task) => task.taskKey === 'h-reorder');
    const analyzeStockTask = result.find((task) => task.taskKey === 'analyze-stock');

    expect(reorderTask?.relatedProducts).toEqual([
      {
        id: 'master-stock-only',
        name: '재고 전용 상품',
        metric: '재고',
        value: '1개 (기준 3)',
      },
    ]);
    expect(analyzeStockTask?.relatedProducts).toEqual(reorderTask?.relatedProducts);
  });
});
