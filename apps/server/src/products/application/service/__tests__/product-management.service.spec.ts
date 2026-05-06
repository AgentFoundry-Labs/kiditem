import { describe, expect, it, vi } from 'vitest';
import { ProductManagementService } from '../product-management.service';
import type { ManagementFacts, ProductManagementGradeInfo } from '../product-management.read-model';

describe('ProductManagementService.pipelineStats', () => {
  it('separates catalog total from channel-linked products', async () => {
    const prisma = {
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([{ id: 'master-linked' }, { id: 'master-inventory-only' }]),
      },
    };
    const service = new ProductManagementService(prisma as any);
    const grades = new Map<string, ProductManagementGradeInfo>([
      ['master-linked', { grade: 'A', score: 80, rank: 1, prevRank: null, strategy: 'keep' }],
      ['master-inventory-only', { grade: 'B', score: 50, rank: 2, prevRank: null, strategy: 'watch' }],
    ]);
    const facts: ManagementFacts = {
      stockByMaster: new Map(),
      inventoryByMaster: new Map(),
      statusByMaster: new Map(),
      activeAdMasterIds: new Set(),
      optionByMaster: new Map(),
      listingByMaster: new Map(),
      periodMetricsByMaster: new Map(),
      t14MetricsByMaster: new Map(),
      t14PrevMetricsByMaster: new Map(),
      profitByMaster: new Map(),
      reviewCountByMaster: new Map(),
    };

    vi.spyOn(service as any, 'gradeByMaster').mockResolvedValue(grades);
    vi.spyOn(service as any, 'managementFacts').mockResolvedValue(facts);
    vi.spyOn(service as any, 'channelLinkedMasterIds').mockResolvedValue(new Set(['master-linked']));

    const counts = await service.pipelineStats('organization-1', { period: 14 });

    expect(counts.total).toBe(2);
    expect(counts.channelLinkedProducts).toBe(1);
    expect(counts.channelUnlinkedProducts).toBe(1);
    expect(counts.gradeA).toBe(1);
    expect(counts.gradeB).toBe(0);
    expect(counts.low).toBe(0);
  });

  it('counts profit risk only for channel-linked products with live profit data', async () => {
    const prisma = {
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'master-linked-low' },
          { id: 'master-linked-no-profit' },
          { id: 'master-inventory-only-low' },
        ]),
      },
    };
    const service = new ProductManagementService(prisma as any);
    const grades = new Map<string, ProductManagementGradeInfo>([
      ['master-linked-low', { grade: 'B', score: 60, rank: 1, prevRank: null, strategy: 'watch' }],
      ['master-linked-no-profit', { grade: 'C', score: 20, rank: 2, prevRank: null, strategy: 'fix' }],
      ['master-inventory-only-low', { grade: 'A', score: 80, rank: 3, prevRank: null, strategy: 'keep' }],
    ]);
    const facts: ManagementFacts = {
      stockByMaster: new Map(),
      inventoryByMaster: new Map(),
      statusByMaster: new Map(),
      activeAdMasterIds: new Set(),
      optionByMaster: new Map(),
      listingByMaster: new Map(),
      periodMetricsByMaster: new Map(),
      t14MetricsByMaster: new Map(),
      t14PrevMetricsByMaster: new Map(),
      profitByMaster: new Map([
        ['master-linked-low', { revenue: 100_000, netProfit: 2_000, profitRate: 2, orderCount: 3 }],
        ['master-inventory-only-low', { revenue: 100_000, netProfit: 1_000, profitRate: 1, orderCount: 2 }],
      ]),
      reviewCountByMaster: new Map(),
    };

    vi.spyOn(service as any, 'gradeByMaster').mockResolvedValue(grades);
    vi.spyOn(service as any, 'managementFacts').mockResolvedValue(facts);
    vi.spyOn(service as any, 'channelLinkedMasterIds').mockResolvedValue(new Set(['master-linked-low', 'master-linked-no-profit']));

    const counts = await service.pipelineStats('organization-1', { period: 14 });

    expect(counts.low).toBe(1);
    expect(counts.minus).toBe(0);
    expect(counts.gradeA).toBe(0);
    expect(counts.gradeB).toBe(1);
    expect(counts.gradeC).toBe(1);
  });

  it('does not treat missing profit data as low-margin when filtering', async () => {
    const prisma = {
      masterProduct: {
        findMany: vi.fn()
          .mockResolvedValueOnce([
            { id: 'master-linked-low' },
            { id: 'master-linked-no-profit' },
            { id: 'master-inventory-only-low' },
          ])
          .mockResolvedValueOnce([{ id: 'master-linked-low' }]),
      },
    };
    const service = new ProductManagementService(prisma as any);
    const facts: ManagementFacts = {
      stockByMaster: new Map(),
      inventoryByMaster: new Map(),
      statusByMaster: new Map(),
      activeAdMasterIds: new Set(),
      optionByMaster: new Map(),
      listingByMaster: new Map(),
      periodMetricsByMaster: new Map(),
      t14MetricsByMaster: new Map(),
      t14PrevMetricsByMaster: new Map(),
      profitByMaster: new Map([
        ['master-linked-low', { revenue: 100_000, netProfit: 2_000, profitRate: 2, orderCount: 3 }],
      ]),
      reviewCountByMaster: new Map(),
    };

    vi.spyOn(service as any, 'gradeByMaster').mockResolvedValue(new Map([
      ['master-linked-low', { grade: 'B', score: 60, rank: 1, prevRank: null, strategy: 'watch' }],
    ] satisfies Array<[string, ProductManagementGradeInfo]>));
    vi.spyOn(service as any, 'profitByMaster').mockResolvedValue(facts.profitByMaster);
    vi.spyOn(service as any, 'managementFacts').mockResolvedValue(facts);
    vi.spyOn(service as any, 'channelLinkedMasterIds').mockResolvedValue(new Set(['master-linked-low', 'master-linked-no-profit']));

    const counts = await service.pipelineStats('organization-1', { period: 14, grade: 'low' as any });

    expect(counts.total).toBe(1);
    expect(counts.low).toBe(1);
  });
});
