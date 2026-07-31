import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { MasterProductAbcRepositoryAdapter } from '../adapter/out/repository/master-product-abc.repository.adapter';

function evaluation(masterProductId: string, overrides: Record<string, unknown> = {}) {
  return {
    abcGrade: null,
    provisionalGrade: null,
    lifecycleStage: 'ESTABLISHED' as const,
    confidence: 'HIGH' as const,
    eligibilityReason: 'ELIGIBLE' as const,
    riskFlags: [],
    observedCompleteMonths: 12,
    observationStartMonth: '2025-07',
    periodMetricValue: 10,
    rankingValue: 10,
    grossRevenue: 20,
    grossCost: 10,
    grossProfit: 10,
    grossMarginRate: 50,
    contributionRate: 100,
    cumulativeContributionRate: 100,
    calculatedAt: new Date('2026-07-24T00:00:00Z'),
    sourceCapturedAt: new Date('2026-07-23T00:00:00Z'),
    ...overrides,
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

  it('publishes only changed organization-scoped grades and writes nullable history once', async () => {
    const own = await prisma.masterProduct.create({ data: { organizationId: TEST_ORGANIZATION_ID, code: `ABC-${randomUUID()}`, name: 'Own' } });
    const foreign = await prisma.masterProduct.create({ data: { organizationId: OTHER_ORGANIZATION_ID, code: `ABC-${randomUUID()}`, name: 'Foreign' } });
    const policy = {
      metric: 'SALES_QUANTITY' as const,
      periodDays: 30 as const,
      aCumulativeThreshold: 70,
      bCumulativeThreshold: 90,
      minProvisionalMonths: 3,
      minClassifiedMonths: 6,
      lastCalculatedAt: null,
      sourceCapturedAt: null,
      revision: 0,
    };
    await prisma.masterProductAbcEvaluation.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        masterProductId: foreign.id,
        lifecycleStage: 'NEW',
        confidence: 'LOW',
        eligibilityReason: 'NO_OBSERVATION',
        riskFlags: ['LIMITED_HISTORY'],
        observedCompleteMonths: 0,
        calculatedAt: new Date('2026-07-23T00:00:00Z'),
      },
    });

    const first = await repository.publishGrades({
      organizationId: TEST_ORGANIZATION_ID,
      policy,
      sourceCapturedAt: new Date('2026-07-23T00:00:00Z'),
      grades: new Map([[own.id, 'A'], [foreign.id, 'B']]),
      evaluations: new Map([[own.id, evaluation(own.id, { abcGrade: 'A' })]]),
      metricValues: new Map([[own.id, 10], [foreign.id, 20]]),
    });
    const retry = await repository.publishGrades({
      organizationId: TEST_ORGANIZATION_ID,
      policy: first.policy,
      sourceCapturedAt: new Date('2026-07-23T00:00:00Z'),
      grades: new Map([[own.id, 'A']]),
      evaluations: new Map([[own.id, evaluation(own.id, { abcGrade: 'A' })]]),
      metricValues: new Map([[own.id, 10]]),
    });
    await repository.publishGrades({
      organizationId: TEST_ORGANIZATION_ID,
      policy: { ...retry.policy, metric: 'SALES_AMOUNT', periodDays: 90 },
      sourceCapturedAt: new Date('2026-07-24T00:00:00Z'),
      grades: new Map([[own.id, 'A']]),
      evaluations: new Map([[own.id, evaluation(own.id, { abcGrade: 'A', rankingValue: 15 })]]),
      metricValues: new Map([[own.id, 10]]),
      allowPolicyReplacement: true,
    });
    const stale = await repository.publishGrades({
      organizationId: TEST_ORGANIZATION_ID,
      policy,
      sourceCapturedAt: new Date('2026-07-25T00:00:00Z'),
      grades: new Map([[own.id, 'B']]),
      evaluations: new Map([[own.id, evaluation(own.id, { abcGrade: 'B', rankingValue: 5 })]]),
      metricValues: new Map([[own.id, 10]]),
      allowPolicyReplacement: false,
    });

    expect(first.changedProductCount).toBe(1);
    expect(retry.changedProductCount).toBe(0);
    expect(first.policy.revision).toBe(1);
    expect(retry.policy.revision).toBe(2);
    expect(stale).toMatchObject({ changedProductCount: 0, stale: true });
    expect((await prisma.masterProduct.findUniqueOrThrow({ where: { id: own.id } })).abcGrade).toBe('A');
    expect((await prisma.masterProduct.findUniqueOrThrow({ where: { id: foreign.id } })).abcGrade).toBeNull();
    await expect(prisma.masterProductAbcEvaluation.findUniqueOrThrow({
      where: { masterProductId_organizationId: { masterProductId: foreign.id, organizationId: OTHER_ORGANIZATION_ID } },
    })).resolves.toMatchObject({ lifecycleStage: 'NEW', eligibilityReason: 'NO_OBSERVATION' });
    const ownEvaluation = await prisma.masterProductAbcEvaluation.findUniqueOrThrow({
      where: { masterProductId_organizationId: { masterProductId: own.id, organizationId: TEST_ORGANIZATION_ID } },
    });
    expect(ownEvaluation.rankingValue?.toString()).toBe('15');
    await expect(prisma.masterProductAbcGradeHistory.findMany({ where: { organizationId: TEST_ORGANIZATION_ID } }))
      .resolves.toEqual([expect.objectContaining({ masterProductId: own.id, oldGrade: null, newGrade: 'A' })]);
    await expect(repository.findPolicy(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
      metric: 'SALES_AMOUNT', periodDays: 90,
      minProvisionalMonths: 3, minClassifiedMonths: 6,
    });
  });

  it('serializes equal-revision publications and rejects the stale loser', async () => {
    const product = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: `ABC-RACE-${randomUUID()}`,
        name: 'Publication race',
      },
    });
    const policy = {
      metric: 'SALES_QUANTITY' as const,
      periodDays: 30 as const,
      aCumulativeThreshold: 70,
      bCumulativeThreshold: 90,
      minProvisionalMonths: 3,
      minClassifiedMonths: 6,
      lastCalculatedAt: null,
      sourceCapturedAt: null,
      revision: 0,
    };
    const publish = (abcGrade: 'A' | 'B') => repository.publishGrades({
      organizationId: TEST_ORGANIZATION_ID,
      policy,
      sourceCapturedAt: new Date('2026-07-23T00:00:00Z'),
      grades: new Map([[product.id, abcGrade]]),
      evaluations: new Map([[product.id, evaluation(product.id, { abcGrade })]]),
      metricValues: new Map([[product.id, abcGrade === 'A' ? 10 : 5]]),
    });

    const results = await Promise.all([publish('A'), publish('B')]);

    expect(results.filter((result) => result.stale)).toHaveLength(1);
    expect(results.filter((result) => !result.stale)).toHaveLength(1);
    await expect(repository.findPolicy(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
      revision: 1,
    });
    await expect(prisma.masterProductAbcGradeHistory.count({
      where: { organizationId: TEST_ORGANIZATION_ID, masterProductId: product.id },
    })).resolves.toBe(1);
  });

  it('keeps exactly one current lifecycle evaluation on its organization-fenced product', async () => {
    const own = await prisma.masterProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: `ABC-EVAL-${randomUUID()}`, name: 'Own evaluation' },
    });
    const foreign = await prisma.masterProduct.create({
      data: { organizationId: OTHER_ORGANIZATION_ID, code: `ABC-EVAL-${randomUUID()}`, name: 'Foreign evaluation' },
    });
    const evaluation = {
      organizationId: TEST_ORGANIZATION_ID,
      masterProductId: own.id,
      lifecycleStage: 'NEW',
      confidence: 'LOW',
      eligibilityReason: 'NO_OBSERVATION',
      riskFlags: ['LIMITED_HISTORY'],
      observedCompleteMonths: 0,
      calculatedAt: new Date('2026-07-24T00:00:00Z'),
    };

    await prisma.masterProductAbcEvaluation.create({ data: evaluation });
    await expect(prisma.masterProductAbcEvaluation.create({ data: evaluation })).rejects.toThrow();
    await expect(prisma.masterProductAbcEvaluation.create({
      data: { ...evaluation, masterProductId: foreign.id },
    })).rejects.toThrow();
    await expect(prisma.masterProduct.findUniqueOrThrow({
      where: { id: own.id },
      include: { abcEvaluation: true },
    })).resolves.toMatchObject({
      abcEvaluation: { lifecycleStage: 'NEW', eligibilityReason: 'NO_OBSERVATION' },
    });
  });
});
