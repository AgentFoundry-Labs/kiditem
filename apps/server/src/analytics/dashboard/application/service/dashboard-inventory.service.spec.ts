import { describe, expect, it, vi } from 'vitest';
import { buildDashboardContext } from '../../domain/context';
import type { DashboardInventoryRepositoryPort } from '../port/out/repository/dashboard-inventory.repository.port';
import { DashboardInventoryService } from './dashboard-inventory.service';

function buildRepository(
  overrides: Partial<DashboardInventoryRepositoryPort> = {},
): DashboardInventoryRepositoryPort {
  return {
    countActiveProductsByGrade: vi.fn().mockResolvedValue([]),
    findUnreadAlerts: vi.fn().mockResolvedValue([]),
    countActiveProducts: vi.fn().mockResolvedValue(0),
    countChannelLinkedProducts: vi.fn().mockResolvedValue(0),
    fetchPerListingMetrics: vi.fn().mockResolvedValue([]),
    countOutOfStockMasterProducts: vi.fn().mockResolvedValue(0),
    countMappingAttentionChannelSkus: vi.fn().mockResolvedValue(0),
    countChannelSkusByMappingStatus: vi.fn().mockResolvedValue([]),
    findGradeHistory: vi.fn().mockResolvedValue([]),
    countLowCtrThumbnails: vi.fn().mockResolvedValue(0),
    findAGradeReviewCounts: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('DashboardInventoryService', () => {
  it('reports factual Sellpia zero-stock and channel mapping-attention SKU counts', async () => {
    const repository = buildRepository({
      countOutOfStockMasterProducts: vi.fn().mockResolvedValue(7),
      countMappingAttentionChannelSkus: vi.fn().mockResolvedValue(3),
      countChannelSkusByMappingStatus: vi.fn().mockResolvedValue([
        { mappingStatus: 'matched', count: 8 },
        { mappingStatus: 'unmatched', count: 2 },
        { mappingStatus: 'needs_review', count: 1 },
      ]),
    });

    const result = await new DashboardInventoryService(repository).getSummary(
      buildDashboardContext(
        undefined,
        undefined,
        undefined,
        new Date('2026-07-12T00:00:00.000Z'),
      ),
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.warnings).toMatchObject({
      outOfStockSkus: 7,
      mappingAttentionSkus: 3,
    });
    expect(result.warnings).not.toHaveProperty('needReorder');
    expect(result.mappingStatusCounts).toEqual({ matched: 8, unmatched: 2, needsReview: 1 });
  });

  it('returns fixed stored A/B/C counts and keeps unclassified products separate', async () => {
    const repository = buildRepository({
      countActiveProductsByGrade: vi.fn().mockResolvedValue([
        { abcGrade: 'A', count: 2 },
        { abcGrade: 'B', count: 1 },
        { abcGrade: null, count: 4 },
        { abcGrade: 'legacy', count: 9 },
      ]),
      countActiveProducts: vi.fn().mockResolvedValue(7),
    });

    const result = await new DashboardInventoryService(repository).getSummary(
      buildDashboardContext(),
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.gradeCount).toEqual({ A: 2, B: 1, C: 0 });
    expect(result.classifiedProductCount).toBe(3);
    expect(result.unclassifiedProductCount).toBe(4);
  });

  it('counts nullable automatic MasterProduct grade history transitions', async () => {
    const repository = buildRepository({
      findGradeHistory: vi.fn().mockResolvedValue([
        { oldGrade: null, newGrade: 'A' },
        { oldGrade: 'A', newGrade: null },
        { oldGrade: 'B', newGrade: 'C' },
        { oldGrade: 'C', newGrade: 'A' },
      ]),
    });

    const result = await new DashboardInventoryService(repository).getSummary(
      buildDashboardContext(),
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.gradeChanges).toEqual({ upgraded: 2, downgraded: 2, total: 4 });
  });
});
