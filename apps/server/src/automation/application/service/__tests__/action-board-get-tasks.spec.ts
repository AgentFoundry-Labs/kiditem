import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPerListingMetrics } from '../../../../common/per-listing-profit';
import { ActionBoardService } from '../action-board.service';
import { ActionBoardRepositoryAdapter } from '../../../adapter/out/repository/action-board.repository.adapter';

vi.mock('../../../../common/per-listing-profit', () => ({
  buildPerListingMetrics: vi.fn(),
}));

const mockedBuildPerListingMetrics = vi.mocked(buildPerListingMetrics);

function makePrisma() {
  return {
    actionTask: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    masterProduct: {
      count: vi.fn(),
    },
    channelListingOption: {
      count: vi.fn(),
    },
    channelListing: {
      findMany: vi.fn(),
    },
    thumbnail: {
      count: vi.fn(),
    },
  };
}

function makeTask(taskKey: string, priority: 'urgent' | 'high' | 'medium') {
  return {
    id: `task-${taskKey}`,
    organizationId: 'organization-1',
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

describe('ActionBoardService.getTasks', () => {
  let service: ActionBoardService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ActionBoardService(
      new ActionBoardRepositoryAdapter(prisma as any),
    );
    mockedBuildPerListingMetrics.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives warning seeds from live metrics with explicit organization scope and KST month boundaries', async () => {
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
    prisma.masterProduct.count.mockResolvedValue(1);
    prisma.channelListingOption.count.mockResolvedValue(2);
    prisma.thumbnail.count.mockResolvedValue(2);
    prisma.channelListing.findMany.mockResolvedValue([
      { _count: { reviews: 3 } },
    ]);
    prisma.actionTask.findMany.mockResolvedValue([
      makeTask('h-zero-stock', 'high'),
      makeTask('h-mapping-attention', 'high'),
      makeTask('h-ad-bid', 'urgent'),
      makeTask('h-minus-ad-stop', 'urgent'),
    ]);

    const result = await service.getTasks('organization-1');

    expect(mockedBuildPerListingMetrics).toHaveBeenCalledWith(
      prisma as any,
      'organization-1',
      new Date('2026-03-31T15:00:00.000Z'),
      new Date('2026-04-30T15:00:00.000Z'),
    );
    expect(prisma.masterProduct.count).toHaveBeenCalledWith({
      where: { organizationId: 'organization-1', isActive: true, currentStock: 0 },
    });
    expect(prisma.channelListingOption.count).toHaveBeenCalledWith({
      where: {
        isActive: true,
        components: { none: {} },
        listing: { is: { organizationId: 'organization-1', isActive: true } },
      },
    });
    expect(prisma.thumbnail.count).toHaveBeenCalledWith({
      where: { organizationId: 'organization-1', ctr: { gt: 0, lt: 1.5 } },
    });
    expect(prisma.channelListing.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'organization-1', isActive: true, abcGrade: 'A' },
      select: { _count: { select: { reviews: true } } },
    });

    const seededTaskKeys = prisma.actionTask.upsert.mock.calls.map(
      ([call]) => call.where.organizationId_taskKey_date.taskKey,
    );
    expect(seededTaskKeys).toEqual(
      expect.arrayContaining([
        'h-ad-bid',
        'h-minus-ad-stop',
        'h-minus-price',
        'h-zero-stock',
        'h-mapping-attention',
        'h-ad-rate',
        'h-low-profit',
        'h-thumbnail',
        'h-review',
        'h-price-reset',
        'analyze-deficit',
        'analyze-ad',
      ]),
    );
    expect(
      prisma.actionTask.upsert.mock.calls.every(
        ([call]) => call.where.organizationId_taskKey_date.organizationId === 'organization-1',
      ),
    ).toBe(true);

    expect(result.map((task) => task.taskKey)).toEqual([
      'h-ad-bid',
      'h-minus-ad-stop',
      'h-zero-stock',
      'h-mapping-attention',
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
    expect(result[2].relatedProducts).toEqual([]);
    expect(result[3].relatedProducts).toEqual([]);
  });

  it('keeps read-only inventory attention tasks when current-month live metrics are empty', async () => {
    mockedBuildPerListingMetrics.mockResolvedValue([]);
    prisma.masterProduct.count.mockResolvedValue(1);
    prisma.channelListingOption.count.mockResolvedValue(1);
    prisma.thumbnail.count.mockResolvedValue(0);
    prisma.channelListing.findMany.mockResolvedValue([]);
    prisma.actionTask.findMany.mockResolvedValue([
      makeTask('h-zero-stock', 'high'),
      makeTask('h-mapping-attention', 'high'),
    ]);

    const result = await service.getTasks('organization-1');

    const seededTaskKeys = prisma.actionTask.upsert.mock.calls.map(
      ([call]) => call.where.organizationId_taskKey_date.taskKey,
    );
    expect(seededTaskKeys).toEqual(
      expect.arrayContaining([
        'h-zero-stock',
        'h-mapping-attention',
        'h-ad-csv',
        'recalc-grade',
        'analyze-ad-rules',
        'analyze-category',
      ]),
    );
    expect(seededTaskKeys).not.toContain('h-minus-ad-stop');
    expect(seededTaskKeys).not.toContain('h-ad-bid');

    expect(result.find((task) => task.taskKey === 'h-zero-stock')?.relatedProducts).toEqual([]);
    expect(result.find((task) => task.taskKey === 'h-mapping-attention')?.relatedProducts).toEqual([]);
    expect(result.map((task) => task.taskKey)).not.toEqual(
      expect.arrayContaining(['h-reorder', 'analyze-stock']),
    );
  });
});
