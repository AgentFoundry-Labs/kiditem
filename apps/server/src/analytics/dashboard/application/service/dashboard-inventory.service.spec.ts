import { describe, expect, it, vi } from 'vitest';
import { buildDashboardContext } from '../../domain/context';
import type { DashboardInventoryRepositoryPort } from '../port/out/repository/dashboard-inventory.repository.port';
import { DashboardInventoryService } from './dashboard-inventory.service';

function repository(
  overrides: Partial<DashboardInventoryRepositoryPort> = {},
): DashboardInventoryRepositoryPort {
  return {
    countActiveProductsByGrade: vi.fn().mockResolvedValue([]),
    countActiveProductsByAbcStatus: vi.fn().mockResolvedValue([]),
    findActiveAbcContributions: vi.fn().mockResolvedValue([]),
    countUnclassifiedActiveProducts: vi.fn().mockResolvedValue(0),
    findAbcFormula: vi.fn().mockResolvedValue(null),
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
  it('reports automatic calculation statuses and contribution, not cumulative-portfolio lifecycle buckets', async () => {
    const result = await new DashboardInventoryService(repository({
      countActiveProducts: vi.fn().mockResolvedValue(8),
      countChannelLinkedProducts: vi.fn().mockResolvedValue(6),
      countActiveProductsByGrade: vi.fn().mockResolvedValue([
        { abcGrade: 'A', count: 2 }, { abcGrade: 'B', count: 1 },
      ]),
      countActiveProductsByAbcStatus: vi.fn().mockResolvedValue([
        { calculationStatus: 'READY', count: 3 },
        { calculationStatus: 'INSUFFICIENT_EVIDENCE', count: 2 },
        { calculationStatus: 'SELLPIA_SOURCE_STALE', count: 1 },
      ]),
      findActiveAbcContributions: vi.fn().mockResolvedValue([
        { abcGrade: 'A', weightedContributionProfit: 800 },
        { abcGrade: 'B', weightedContributionProfit: 200 },
      ]),
      countUnclassifiedActiveProducts: vi.fn().mockResolvedValue(5),
    })).getSummary(buildDashboardContext(), '11111111-1111-4111-8111-111111111111');

    expect(result).toMatchObject({
      gradeCount: { A: 2, B: 1, C: 0 },
      classifiedProductCount: 3,
      unclassifiedProductCount: 5,
      abcStatusCount: {
        READY: 3, INSUFFICIENT_EVIDENCE: 2, SELLPIA_SOURCE_STALE: 1,
      },
      abcContributionProfit: {
        amountByGrade: { A: 800, B: 200, C: 0 },
        shareByGrade: { A: 0.8, B: 0.2, C: 0 },
      },
      abcFormula: null,
    });
    expect(result).not.toHaveProperty('abcLifecycleCount');
    expect(result).not.toHaveProperty('abcRiskCount');
  });

  it('keeps factual inventory/mapping warning counts and grade transitions', async () => {
    const result = await new DashboardInventoryService(repository({
      countOutOfStockMasterProducts: vi.fn().mockResolvedValue(7),
      countMappingAttentionChannelSkus: vi.fn().mockResolvedValue(3),
      countChannelSkusByMappingStatus: vi.fn().mockResolvedValue([
        { mappingStatus: 'matched', count: 8 },
        { mappingStatus: 'unmatched', count: 2 },
        { mappingStatus: 'needs_review', count: 1 },
      ]),
      findGradeHistory: vi.fn().mockResolvedValue([
        { oldGrade: null, newGrade: 'A' }, { oldGrade: 'A', newGrade: null },
        { oldGrade: 'B', newGrade: 'C' }, { oldGrade: 'C', newGrade: 'A' },
      ]),
    })).getSummary(buildDashboardContext(), '11111111-1111-4111-8111-111111111111');

    expect(result.warnings).toMatchObject({ outOfStockSkus: 7, mappingAttentionSkus: 3 });
    expect(result.mappingStatusCounts).toEqual({ matched: 8, unmatched: 2, needsReview: 1 });
    expect(result.gradeChanges).toEqual({ upgraded: 2, downgraded: 2, total: 4 });
  });
});
