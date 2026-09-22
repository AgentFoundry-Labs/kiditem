import { describe, expect, it, vi } from 'vitest';
import { buildDashboardContext } from '../../domain/context';
import { DashboardInventoryService } from './dashboard-inventory.service';
import type {
  AbcStatusCounts,
  DashboardInventoryRepositoryPort,
} from '../port/out/repository/dashboard-inventory.repository.port';

/** The ABC counts plus the evaluation as-of they were classified against. */
function abcStatusCounts(overrides: Partial<AbcStatusCounts> = {}): AbcStatusCounts {
  return {
    rows: [],
    evaluatedAsOf: {
      targetCutoff: '2026-08-31',
      actualCutoff: '2026-08-31',
      capturedAt: '2026-09-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

function abcFacts(overrides: Record<string, unknown> = {}) {
  return {
    gradeRows: [],
    statusRows: [],
    contributionRows: [],
    withheldContributionProductCount: 0,
    unclassifiedProductCount: 0,
    formula: null,
    evaluatedAsOf: abcStatusCounts().evaluatedAsOf,
    publication: null,
    gradeChanges: [],
    aGradeMasterProductIds: [],
    ...overrides,
  };
}

function repository(
  overrides: Partial<DashboardInventoryRepositoryPort> = {},
): DashboardInventoryRepositoryPort {
  return {
    readProductAbcFacts: vi.fn().mockResolvedValue(abcFacts()),
    findUnreadAlerts: vi.fn().mockResolvedValue([]),
    countActiveProducts: vi.fn().mockResolvedValue(0),
    fetchPerListingMetrics: vi.fn().mockResolvedValue({
      rows: [],
      withheldListings: 0,
      orderWindowComplete: true,
      hasAdAccount: true,
    }),
    readInventoryAvailabilityFacts: vi.fn().mockResolvedValue({
      outOfStockSkus: 0,
      linkedMasterProductCount: 0,
      mappingStatusRows: [],
      snapshot: { collected: true, generation: '1', verifiedAt: '2026-09-01T00:00:00.000Z' },
    }),
    countLowCtrThumbnails: vi.fn().mockResolvedValue(0),
    findReviewCountsForProducts: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('DashboardInventoryService', () => {
  it('counts low-review products from owner-published A-grade identities', async () => {
    const findReviewCountsForProducts = vi.fn().mockResolvedValue([
      { reviewCount: 3 },
      { reviewCount: 12 },
    ]);
    const result = await new DashboardInventoryService(repository({
      readProductAbcFacts: vi.fn().mockResolvedValue(abcFacts({
        gradeRows: [{ abcGrade: 'A', count: 2 }],
        aGradeMasterProductIds: ['official-a', 'official-a-enough-reviews'],
      })),
      findReviewCountsForProducts,
    })).getSummary(
      buildDashboardContext(),
      '11111111-1111-4111-8111-111111111111',
    );

    expect(findReviewCountsForProducts).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      ['official-a', 'official-a-enough-reviews'],
    );
    expect(result.warnings.lowReviewProducts).toBe(1);
  });

  it('reports automatic calculation statuses and contribution, not cumulative-portfolio lifecycle buckets', async () => {
    const result = await new DashboardInventoryService(repository({
      countActiveProducts: vi.fn().mockResolvedValue(8),
      readProductAbcFacts: vi.fn().mockResolvedValue(abcFacts({
        gradeRows: [{ abcGrade: 'A', count: 2 }, { abcGrade: 'B', count: 1 }],
        statusRows: [
          { displayStatus: 'READY', count: 3 },
          { displayStatus: 'INSUFFICIENT_EVIDENCE', count: 2 },
          { displayStatus: 'SELLPIA_SOURCE_STALE', count: 1 },
        ],
        contributionRows: [
        { abcGrade: 'A', weightedOperatingProfit: 800 },
        { abcGrade: 'B', weightedOperatingProfit: 200 },
        ],
        unclassifiedProductCount: 5,
      })),
      readInventoryAvailabilityFacts: vi.fn().mockResolvedValue({
        outOfStockSkus: 0,
        linkedMasterProductCount: 6,
        mappingStatusRows: [],
        snapshot: { collected: true, generation: '1', verifiedAt: '2026-09-01T00:00:00.000Z' },
      }),
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
        basis: { denominator: 1000, includedProductCount: 2, withheldProductCount: 0 },
      },
      abcFormula: null,
    });
    expect(result).not.toHaveProperty('abcLifecycleCount');
    expect(result).not.toHaveProperty('abcRiskCount');
  });

  it('keeps factual inventory/mapping warning counts and grade transitions', async () => {
    const result = await new DashboardInventoryService(repository({
      readInventoryAvailabilityFacts: vi.fn().mockResolvedValue({
        outOfStockSkus: 7,
        linkedMasterProductCount: 8,
        mappingStatusRows: [
          { mappingStatus: 'matched', count: 8 },
          { mappingStatus: 'unmatched', count: 2 },
          { mappingStatus: 'needs_review', count: 1 },
        ],
        snapshot: { collected: true, generation: '1', verifiedAt: '2026-09-01T00:00:00.000Z' },
      }),
      readProductAbcFacts: vi.fn().mockResolvedValue(abcFacts({
        gradeChanges: [
          { oldGrade: null, newGrade: 'A' }, { oldGrade: 'A', newGrade: null },
          { oldGrade: 'B', newGrade: 'C' }, { oldGrade: 'C', newGrade: 'A' },
        ],
      })),
    })).getSummary(buildDashboardContext(), '11111111-1111-4111-8111-111111111111');

    expect(result.warnings).toMatchObject({ outOfStockSkus: 7, mappingAttentionSkus: 3 });
    expect(result.channelLinkedProducts).toBe(8);
    expect(result).not.toHaveProperty('mappingStatusCounts');
    expect(result.gradeChanges).toEqual({
      upgraded: 2,
      downgraded: 2,
      total: 4,
      byGrade: { A: { in: 2, out: 1 }, B: { in: 0, out: 1 }, C: { in: 1, out: 1 } },
      moves: [
        { from: 'C', to: 'A', count: 1 },
        { from: null, to: 'A', count: 1 },
        { from: 'B', to: 'C', count: 1 },
        { from: 'A', to: null, count: 1 },
      ],
    });
  });

  it('keeps stock unavailable while counting configured links before Inventory collection', async () => {
    const result = await new DashboardInventoryService(repository({
      countActiveProducts: vi.fn().mockResolvedValue(4),
      readInventoryAvailabilityFacts: vi.fn().mockResolvedValue({
        outOfStockSkus: null,
        linkedMasterProductCount: 2,
        mappingStatusRows: [{ mappingStatus: 'unmatched', count: 2 }],
        snapshot: { collected: false, generation: null, verifiedAt: null },
      }),
    })).getSummary(buildDashboardContext(), '11111111-1111-4111-8111-111111111111');

    expect(result.warnings.outOfStockSkus).toBeNull();
    expect(result.channelLinkedProducts).toBe(2);
    expect(result.channelUnlinkedProducts).toBe(2);
    expect(result.metricBasis?.channelLinkedProducts).toMatchObject({
      kind: 'snapshot', measured: true,
    });
    expect(result.metricBasis?.channelUnlinkedProducts).toMatchObject({
      kind: 'snapshot', measured: true,
    });
    expect(result.warnings.mappingAttentionSkus).toBe(2);
    expect(result.metricBasis?.['warnings.outOfStockSkus']).toMatchObject({
      kind: 'snapshot', measured: false,
    });
  });

  it('publishes null contribution shares and denominator when measured grade amounts sum to zero', async () => {
    const result = await new DashboardInventoryService(repository({
      readProductAbcFacts: vi.fn().mockResolvedValue(abcFacts({
        contributionRows: [
          { abcGrade: 'A', weightedOperatingProfit: 20 },
          { abcGrade: 'B', weightedOperatingProfit: -20 },
          { abcGrade: 'C', weightedOperatingProfit: 0 },
        ],
        publication: {
          publicationRevision: 3,
          officialCutoffDate: '2026-08-31',
          publishedAt: '2026-09-01T00:00:00.000Z',
          sellpiaSourceImportRunId: '11111111-1111-4111-8111-111111111111',
          advertisingSourceImportRunId: '22222222-2222-4222-8222-222222222222',
          mappingGeneration: '7',
        },
      })),
    })).getSummary(buildDashboardContext(), '11111111-1111-4111-8111-111111111111');

    expect(result.abcContributionProfit).toEqual({
      amountByGrade: { A: 20, B: -20, C: 0 },
      shareByGrade: { A: null, B: null, C: null },
      basis: {
        publicationRevision: 3,
        officialCutoffDate: '2026-08-31',
        publishedAt: '2026-09-01T00:00:00.000Z',
        sellpiaSourceImportRunId: '11111111-1111-4111-8111-111111111111',
        advertisingSourceImportRunId: '22222222-2222-4222-8222-222222222222',
        mappingGeneration: '7',
        includedProductCount: 3,
        withheldProductCount: 0,
        denominator: null,
      },
    });
  });
});
