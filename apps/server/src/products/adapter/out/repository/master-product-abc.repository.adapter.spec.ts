import { describe, expect, it, vi } from 'vitest';
import { MasterProductAbcRepositoryAdapter } from './master-product-abc.repository.adapter';
import type { ProductAbcEvaluation, ProductAbcFormulaSummary } from '@kiditem/shared/product-abc';

const organizationId = '00000000-0000-4000-8000-000000000001';
const formulaVersionId = '00000000-0000-4000-8000-000000000002';

const formula: ProductAbcFormulaSummary = {
  formulaKey: 'ABC_V1',
  version: 1,
  calculationCodeChecksum: 'a'.repeat(64),
  formulaChecksum: 'b'.repeat(64),
  activatedAt: new Date('2026-08-01T00:00:00.000Z'),
  halfLifeDays: 90,
  weights: { profit: 0.5, margin: 0.3, persistence: 0.2 },
  dayShrinkK: 30,
  cutoffs: { cToB: 40, bToA: 70 },
  normalizationKnots: {
    profitVelocity: [{ value: 0, score: 0 }, { value: 100, score: 100 }],
    contributionMargin: [{ value: 0, score: 0 }, { value: 1, score: 100 }],
    lossRecurrence: [{ value: 0, score: 0 }, { value: 1, score: 100 }],
  },
  trainingRange: { from: '2025-07-01', to: '2026-07-01' },
  sampleCount: 30,
  foldCount: 3,
  calibrationMetrics: {
    meanSpearmanRankCorrelation: 0.5,
    meanExplainedVariance: 0.2,
    gradeChurnRate: 0.1,
  },
};

describe('MasterProductAbcRepositoryAdapter', () => {
  it('acquires the organization advisory lock before rejecting a stale formula publication', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async () => { calls.push('lock'); }),
      masterProductAbcFormulaState: {
        findUnique: vi.fn(async () => {
          calls.push('formula-state');
          return { revision: 2, activeFormulaVersionId: 'formula-2' };
        }),
      },
      masterProduct: { findMany: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async (work) => work(tx)) };
    const repository = new MasterProductAbcRepositoryAdapter(prisma as never);

    await expect(repository.publishEvaluations({
      organizationId: 'org-1',
      expectedFormulaStateRevision: 1,
      formulaVersionId: 'formula-1',
      evaluations: new Map(),
      reason: 'AUTOMATIC_PROFITABILITY_RECALCULATION',
    })).resolves.toEqual({ changedProductCount: 0, stale: true });

    expect(calls).toEqual(['lock', 'formula-state']);
    expect(tx.masterProduct.findMany).not.toHaveBeenCalled();
  });

  it('publishes with the Operations-owned transaction instead of opening a nested transaction', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      masterProductAbcFormulaState: {
        findUnique: vi.fn().mockResolvedValue({
          revision: 2,
          activeFormulaVersionId: 'formula-2',
        }),
      },
    };
    const prisma = { $transaction: vi.fn() };
    const repository = new MasterProductAbcRepositoryAdapter(prisma as never);

    await expect(repository.publishEvaluationsInAttempt(tx, {
      organizationId: 'org-1',
      expectedFormulaStateRevision: 1,
      formulaVersionId: 'formula-1',
      evaluations: new Map(),
      reason: 'AUTOMATIC_PROFITABILITY_RECALCULATION',
    })).resolves.toEqual({ changedProductCount: 0, stale: true });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('publishes grades and current evaluations in bounded bulk writes', async () => {
    const productIds = [
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000012',
      '00000000-0000-4000-8000-000000000013',
    ];
    const updateMany = vi.fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });
    const deleteMany = vi.fn().mockResolvedValue({ count: 3 });
    const createMany = vi.fn().mockResolvedValue({ count: 3 });
    const historyCreateMany = vi.fn().mockResolvedValue({ count: 3 });
    const tx = {
      $queryRaw: vi.fn(),
      masterProductAbcFormulaState: {
        findUnique: vi.fn().mockResolvedValue({
          revision: 2,
          activeFormulaVersionId: formulaVersionId,
        }),
      },
      channelListing: {
        findMany: vi.fn().mockResolvedValue([sellingListing(productIds)]),
      },
      masterProduct: {
        updateMany,
        findMany: vi.fn().mockResolvedValue([
          { id: productIds[0], abcGrade: null },
          { id: productIds[1], abcGrade: null },
          { id: productIds[2], abcGrade: 'B' },
        ]),
      },
      masterProductAbcEvaluation: { deleteMany, createMany },
      masterProductAbcGradeHistory: { createMany: historyCreateMany },
    };
    const prisma = { $transaction: vi.fn(async (work) => work(tx)) };
    const repository = new MasterProductAbcRepositoryAdapter(prisma as never);

    await expect(repository.publishEvaluations({
      organizationId,
      expectedFormulaStateRevision: 2,
      formulaVersionId,
      evaluations: new Map([
        [productIds[0], evaluation('A')],
        [productIds[1], evaluation('A')],
        [productIds[2], evaluation('C')],
      ]),
      reason: 'AUTOMATIC_PROFITABILITY_RECALCULATION',
    })).resolves.toEqual({ changedProductCount: 3, stale: false });

    expect(updateMany).toHaveBeenCalledTimes(3);
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { organizationId, id: { in: productIds.slice(0, 2) }, abcGrade: null },
      data: { abcGrade: 'A' },
    });
    expect(updateMany).toHaveBeenNthCalledWith(3, {
      where: { organizationId, id: { in: [productIds[2]] }, abcGrade: 'B' },
      data: { abcGrade: 'C' },
    });
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ masterProductId: productIds[0], calculationStatus: 'READY' }),
      expect.objectContaining({ masterProductId: productIds[2], calculationStatus: 'READY' }),
    ]) });
    expect(historyCreateMany).toHaveBeenCalledTimes(1);
  });

  it('chunks large evaluation and history publications at one thousand rows', async () => {
    const productIds = Array.from(
      { length: 1_001 },
      (_, index) => `product-${index.toString().padStart(4, '0')}`,
    );
    const evaluationCreateMany = vi.fn(async ({ data }: { data: unknown[] }) => ({
      count: data.length,
    }));
    const historyCreateMany = vi.fn(async ({ data }: { data: unknown[] }) => ({
      count: data.length,
    }));
    const tx = {
      $queryRaw: vi.fn(),
      masterProductAbcFormulaState: {
        findUnique: vi.fn().mockResolvedValue({
          revision: 2,
          activeFormulaVersionId: formulaVersionId,
        }),
      },
      channelListing: {
        findMany: vi.fn().mockResolvedValue([sellingListing(productIds)]),
      },
      masterProduct: {
        updateMany: vi.fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: productIds.length }),
        findMany: vi.fn().mockResolvedValue(
          productIds.map((id) => ({ id, abcGrade: null })),
        ),
      },
      masterProductAbcEvaluation: {
        deleteMany: vi.fn().mockResolvedValue({ count: productIds.length }),
        createMany: evaluationCreateMany,
      },
      masterProductAbcGradeHistory: { createMany: historyCreateMany },
    };
    const prisma = { $transaction: vi.fn(async (work) => work(tx)) };
    const repository = new MasterProductAbcRepositoryAdapter(prisma as never);

    await repository.publishEvaluations({
      organizationId,
      expectedFormulaStateRevision: 2,
      formulaVersionId,
      evaluations: new Map(productIds.map((id) => [id, evaluation('A')])),
      reason: 'AUTOMATIC_PROFITABILITY_RECALCULATION',
    });

    expect(evaluationCreateMany.mock.calls.map(([{ data }]) => data.length)).toEqual([1_000, 1]);
    expect(historyCreateMany.mock.calls.map(([{ data }]) => data.length)).toEqual([1_000, 1]);
  });
});

function sellingListing(productIds: readonly string[]) {
  return {
    isActive: true,
    status: 'approved',
    rawJson: null,
    channelListingDailySnapshots: [{ saleStatus: '판매중' }],
    options: [{
      status: '판매중',
      inventoryComponents: productIds.map((masterProductId) => ({
        sellpiaInventorySku: {
          isActive: true,
          currentStock: 1,
          masterProductId,
          masterProduct: { isActive: true },
        },
      })),
    }],
  };
}

function evaluation(abcGrade: ProductAbcEvaluation['abcGrade']): ProductAbcEvaluation {
  return {
    abcGrade,
    calculationStatus: 'READY',
    rawScore: 80,
    adjustedScore: 75,
    reliability: 0.8,
    weightedRevenue: 1_000,
    weightedOrderTimeCogs: 200,
    weightedAdSpend: 100,
    weightedContributionProfit: 700,
    profitVelocity30: 350,
    weightedContributionMargin: 0.7,
    lossRecurrence: 0,
    paidOrderCount: 30,
    observationDays: 61,
    firstValidPaidSaleAt: new Date('2026-06-01T00:00:00.000Z'),
    formula,
    sourceFreshness: {
      evaluationCutoffDate: '2026-07-31',
      sellpia: {
        status: 'READY',
        coverageStartDate: '2025-07-01',
        coverageEndDate: '2026-07-31',
        capturedAt: null,
      },
      advertising: {
        status: 'READY',
        coverageStartDate: '2025-07-01',
        coverageEndDate: '2026-07-31',
        capturedAt: null,
      },
      orders: {
        status: 'READY',
        coverageStartDate: '2025-07-01',
        coverageEndDate: '2026-07-31',
        capturedAt: null,
      },
      mapping: { status: 'READY', inventoryGeneration: '1', verifiedAt: formula.activatedAt },
    },
    costBreakdown: {
      recognizedRevenue: { amount: 1_000, status: 'OBSERVED' },
      orderTimeCogs: { amount: 200, status: 'OBSERVED' },
      advertisingSpend: { amount: 100, status: 'OBSERVED' },
      marketplaceCommission: { amount: 0, status: 'NOT_APPLIED' },
      outboundFulfillment: { amount: 0, status: 'NOT_APPLIED' },
      returnLoss: { amount: 0, status: 'NOT_APPLIED' },
      otherVariableCost: { amount: 0, status: 'NOT_APPLIED' },
    },
    statusDetail: null,
    calculatedAt: formula.activatedAt,
  };
}
