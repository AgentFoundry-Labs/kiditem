import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ProductAbcEvaluation, ProductAbcFormulaSummary } from '@kiditem/shared/product-abc';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { MasterProductAbcRepositoryAdapter } from '../adapter/out/repository/master-product-abc.repository.adapter';

const activatedAt = new Date('2026-08-01T00:00:00.000Z');
const formula: ProductAbcFormulaSummary = {
  formulaKey: 'ABC_V1', version: 1,
  calculationCodeChecksum: 'a'.repeat(64), formulaChecksum: 'b'.repeat(64), activatedAt,
  halfLifeDays: 90, weights: { profit: 0.5, margin: 0.3, persistence: 0.2 }, orderShrinkK: 20, dayShrinkK: 30,
  cutoffs: { cToB: 40, bToA: 70 },
  normalizationKnots: {
    profitVelocity: [{ value: 0, score: 0 }, { value: 100, score: 100 }],
    contributionMargin: [{ value: 0, score: 0 }, { value: 1, score: 100 }],
    lossRecurrence: [{ value: 0, score: 0 }, { value: 1, score: 100 }],
  },
  trainingRange: { from: '2025-07-01', to: '2026-07-01' }, sampleCount: 30, foldCount: 3,
  calibrationMetrics: { meanSpearmanRankCorrelation: 0.5, meanExplainedVariance: 0.2, gradeChurnRate: 0.1 },
};

function evaluation(): ProductAbcEvaluation {
  return {
    abcGrade: 'A', calculationStatus: 'READY', rawScore: 80, adjustedScore: 75, reliability: 0.8,
    weightedRevenue: 1_000, weightedOrderTimeCogs: 200, weightedAdSpend: 100, weightedContributionProfit: 700,
    profitVelocity30: 350, weightedContributionMargin: 0.7, lossRecurrence: 0,
    paidOrderCount: 30, observationDays: 61, firstValidPaidSaleAt: new Date('2026-06-01T00:00:00.000Z'), formula,
    sourceFreshness: {
      evaluationCutoffDate: '2026-07-31',
      sellpia: { status: 'READY', coverageStartDate: '2025-07-01', coverageEndDate: '2026-07-31', capturedAt: null },
      advertising: { status: 'READY', coverageStartDate: '2025-07-01', coverageEndDate: '2026-07-31', capturedAt: null },
    },
    costBreakdown: {
      recognizedRevenue: { amount: 1_000, status: 'OBSERVED' }, orderTimeCogs: { amount: 200, status: 'OBSERVED' },
      advertisingSpend: { amount: 100, status: 'OBSERVED' }, marketplaceCommission: { amount: 0, status: 'NOT_APPLIED' },
      outboundFulfillment: { amount: 0, status: 'NOT_APPLIED' }, returnLoss: { amount: 0, status: 'NOT_APPLIED' },
      otherVariableCost: { amount: 0, status: 'NOT_APPLIED' },
    },
    statusDetail: null, calculatedAt: activatedAt,
  };
}

describe('MasterProductAbcRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: MasterProductAbcRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new MasterProductAbcRepositoryAdapter(prisma as unknown as PrismaService);
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  it('immutably stores the initial formula and publishes an organization-fenced current evaluation/history', async () => {
    const product = await prisma.masterProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: `ABC-${randomUUID()}`, name: 'Profitability ABC' },
    });
    const empty = await repository.getFormulaState(TEST_ORGANIZATION_ID);
    const initialized = await repository.ensureInitialFormula({
      organizationId: TEST_ORGANIZATION_ID, expectedRevision: empty.revision, formula,
    });
    expect(initialized).toMatchObject({ created: true, stale: false, state: { revision: 1 } });

    await expect(repository.publishEvaluations({
      organizationId: TEST_ORGANIZATION_ID,
      expectedFormulaStateRevision: initialized.state.revision,
      formulaVersionId: initialized.state.formulaVersionId,
      evaluations: new Map([[product.id, evaluation()]]),
      reason: 'AUTOMATIC_PROFITABILITY_RECALCULATION',
    })).resolves.toEqual({ changedProductCount: 1, stale: false });

    await expect(prisma.masterProduct.findUniqueOrThrow({ where: { id: product.id } }))
      .resolves.toMatchObject({ abcGrade: 'A' });
    await expect(prisma.masterProductAbcEvaluation.findUniqueOrThrow({
      where: { masterProductId_organizationId: { masterProductId: product.id, organizationId: TEST_ORGANIZATION_ID } },
    })).resolves.toMatchObject({ calculationStatus: 'READY', sellpiaSourceStatus: 'READY' });
    await expect(prisma.masterProductAbcGradeHistory.findMany({ where: { masterProductId: product.id } }))
      .resolves.toEqual([expect.objectContaining({ oldGrade: null, newGrade: 'A', formulaVersionId: initialized.state.formulaVersionId })]);
    await expect(repository.publishEvaluations({
      organizationId: TEST_ORGANIZATION_ID, expectedFormulaStateRevision: 0, formulaVersionId: null,
      evaluations: new Map(), reason: 'AUTOMATIC_PROFITABILITY_RECALCULATION',
    })).resolves.toEqual({ changedProductCount: 0, stale: true });
  });
});
