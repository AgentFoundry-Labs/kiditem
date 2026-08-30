import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ProductAbcFormulaSummary } from '@kiditem/shared/product-abc';
import { MasterProductAbcService } from './master-product-abc.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const productId = '00000000-0000-4000-8000-000000000011';

const formula: ProductAbcFormulaSummary = {
  formulaKey: 'ABC_V1', version: 1,
  calculationCodeChecksum: 'a'.repeat(64), formulaChecksum: 'b'.repeat(64),
  activatedAt: new Date('2026-08-01T00:00:00.000Z'),
  halfLifeDays: 90, weights: { profit: 0.5, margin: 0.3, persistence: 0.2 },
  dayShrinkK: 30, cutoffs: { cToB: 40, bToA: 70 },
  normalizationKnots: {
    profitVelocity: [{ value: 0, score: 0 }, { value: 100, score: 100 }],
    contributionMargin: [{ value: 0, score: 0 }, { value: 1, score: 100 }],
    lossRecurrence: [{ value: 0, score: 0 }, { value: 1, score: 100 }],
  },
  trainingRange: { from: '2025-07-01', to: '2026-07-01' },
  sampleCount: 100, foldCount: 4,
  calibrationMetrics: { meanSpearmanRankCorrelation: 0.7, meanExplainedVariance: 0.5, gradeChurnRate: 0.1 },
};

function evidence(overrides = {}) {
  const start = new Date('2026-06-01T00:00:00.000Z');
  const end = new Date('2026-06-30T00:00:00.000Z');
  return {
    masterProductId: productId,
    asOfDate: new Date('2026-07-31T00:00:00.000Z'),
    firstValidPaidSaleAt: start,
    validPaidOrderDates: [start], paidOrderCount: 30, observationDays: 61, eligibilityReached: true,
    sellpiaStatus: 'READY' as const, adStatus: 'READY' as const,
    sellpiaCapturedAt: new Date('2026-08-01T00:00:00.000Z'),
    advertisingCapturedAt: new Date('2026-08-01T00:00:00.000Z'),
    advertisingCoverageStartDate: start,
    advertisingCoverageEndDate: end,
    ordersStatus: 'READY' as const,
    ordersCoverageStartDate: start,
    ordersCoverageEndDate: end,
    ordersCapturedAt: new Date('2026-08-01T00:00:00.000Z'),
    orderLinkedLineCount: 30,
    orderUnlinkedLineCount: 0,
    mappingStatus: 'READY' as const,
    mappingInventoryGeneration: '7',
    mappingVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
    monthlyFacts: [{
      yearMonth: '2026-06', coverageStartDate: start, coverageEndDate: end, coveredDays: 30,
      coverageMidpointEpochDay: 0, revenue: 1_000, sellpiaInAmount: 200, adSpend: 100,
      contributionProfit: 700, negativeCoveredDays: 0, lossGranularity: 'MONTH_INFERRED' as const,
      sourceProductCodes: ['P-1'], sourceOptionCodes: ['O-1'],
      costBreakdown: {
        recognizedRevenue: { amount: 1_000, status: 'OBSERVED' as const },
        orderTimeCogs: { amount: 200, status: 'OBSERVED' as const },
        advertisingSpend: { amount: 100, status: 'OBSERVED' as const },
        marketplaceCommission: { amount: 0, status: 'NOT_APPLIED' as const },
        outboundFulfillment: { amount: 0, status: 'NOT_APPLIED' as const },
        returnLoss: { amount: 0, status: 'NOT_APPLIED' as const },
        otherVariableCost: { amount: 0, status: 'NOT_APPLIED' as const },
      },
    }],
    ...overrides,
  };
}

function repository(overrides = {}) {
  return {
    getFormulaState: vi.fn().mockResolvedValue({ revision: 1, formulaVersionId: 'formula-1', formula }),
    ensureInitialFormula: vi.fn(),
    ensureInitialFormulaInAttempt: vi.fn(),
    listSellingMasterProductIds: vi.fn().mockResolvedValue([productId]),
    findCurrentEvaluations: vi.fn().mockResolvedValue(new Map()),
    publishEvaluations: vi.fn().mockResolvedValue({ changedProductCount: 1, stale: false }),
    publishEvaluationsInAttempt: vi.fn()
      .mockResolvedValue({ changedProductCount: 1, stale: false }),
    reconcileInventoryActivity: vi.fn().mockResolvedValue({
      deactivatedMasterProductIds: [productId],
      reactivatedMasterProductIds: [],
    }),
    ...overrides,
  };
}

describe('MasterProductAbcService', () => {
  it('delegates stock activity reconciliation to the product repository', async () => {
    const products = repository();
    const profitability = { readMany: vi.fn() };
    const service = new MasterProductAbcService(products as never, profitability as never);

    await expect(
      (service as unknown as {
        reconcileInventoryActivity(organizationId: string): Promise<unknown>;
      }).reconcileInventoryActivity(organizationId),
    ).resolves.toEqual({ deactivatedMasterProductIds: [productId], reactivatedMasterProductIds: [] });
    expect(products.reconcileInventoryActivity).toHaveBeenCalledWith(organizationId);
    expect(profitability.readMany).not.toHaveBeenCalled();
  });

  it('evaluates active products from Finance evidence and publishes with the frozen formula pointer', async () => {
    const products = repository();
    const profitability = { readMany: vi.fn().mockResolvedValue([evidence()]) };
    const service = new MasterProductAbcService(products as never, profitability as never);

    await expect(service.recalculate(organizationId)).resolves.toMatchObject({
      changedProductCount: 1, classifiedProductCount: 1,
      grades: [expect.objectContaining({ masterProductId: productId, abcGrade: 'A' })],
    });
    expect(profitability.readMany).toHaveBeenCalledWith(expect.objectContaining({
      organizationId, masterProductIds: [productId], scope: 'ACTIVE_EVALUATION',
    }));
    expect(products.publishEvaluations).toHaveBeenCalledWith(expect.objectContaining({
      expectedFormulaStateRevision: 1, formulaVersionId: 'formula-1', reason: 'AUTOMATIC_PROFITABILITY_RECALCULATION',
    }));
  });

  it('creates an initial fixed formula only when historical evidence is sufficient', async () => {
    const products = repository({
      getFormulaState: vi.fn().mockResolvedValue({ revision: 0, formulaVersionId: null, formula: null }),
    });
    const profitability = { readMany: vi.fn().mockImplementation(async (input) =>
      input.scope === 'HISTORICAL_CALIBRATION' ? [] : [evidence()]) };
    const service = new MasterProductAbcService(products as never, profitability as never);

    await service.recalculate(organizationId);

    expect(products.ensureInitialFormula).not.toHaveBeenCalled();
    expect(products.publishEvaluations).toHaveBeenCalledWith(expect.objectContaining({ formulaVersionId: null }));
  });

  it('retries a stale formula-pointer publication once, then reports a conflict', async () => {
    const retryRepository = repository({
      publishEvaluations: vi.fn()
        .mockResolvedValueOnce({ changedProductCount: 0, stale: true })
        .mockResolvedValueOnce({ changedProductCount: 1, stale: false }),
    });
    const profitability = { readMany: vi.fn().mockResolvedValue([evidence()]) };
    await expect(new MasterProductAbcService(retryRepository as never, profitability as never)
      .recalculate(organizationId)).resolves.toMatchObject({ changedProductCount: 1 });

    const staleRepository = repository({
      publishEvaluations: vi.fn().mockResolvedValue({ changedProductCount: 0, stale: true }),
    });
    await expect(new MasterProductAbcService(staleRepository as never, profitability as never)
      .recalculate(organizationId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not publish after the operation is cancelled', async () => {
    const products = repository();
    const profitability = { readMany: vi.fn().mockResolvedValue([evidence()]) };
    const controller = new AbortController();
    const checkpoint = vi.fn(async () => {
      controller.abort(new Error('operator_cancelled'));
    });
    const service = new MasterProductAbcService(products as never, profitability as never);

    await expect(service.recalculate(organizationId, {
      signal: controller.signal,
      checkpoint,
      withinActiveOperationAttemptFence: vi.fn(),
    })).rejects.toThrow('operator_cancelled');

    expect(products.publishEvaluations).not.toHaveBeenCalled();
    expect(products.publishEvaluationsInAttempt).not.toHaveBeenCalled();
  });

  it('publishes through the active operation attempt transaction when supplied', async () => {
    const transaction = { transaction: true };
    const products = repository({
      publishEvaluationsInAttempt: vi.fn()
        .mockResolvedValue({ changedProductCount: 1, stale: false }),
    });
    const profitability = { readMany: vi.fn().mockResolvedValue([evidence()]) };
    const withinActiveOperationAttemptFence = vi.fn(async (commit) => commit(transaction));
    const service = new MasterProductAbcService(products as never, profitability as never);

    await service.recalculate(organizationId, {
      signal: new AbortController().signal,
      checkpoint: vi.fn().mockResolvedValue(undefined),
      withinActiveOperationAttemptFence,
    });

    expect(products.publishEvaluations).not.toHaveBeenCalled();
    expect(products.publishEvaluationsInAttempt).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ organizationId }),
    );
  });
});
