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
    const policy = { metric: 'SALES_QUANTITY' as const, periodDays: 30 as const, aCumulativeThreshold: 70, bCumulativeThreshold: 90, lastCalculatedAt: null, sourceCapturedAt: null, revision: 0 };

    const first = await repository.publishGrades({
      organizationId: TEST_ORGANIZATION_ID,
      policy,
      sourceCapturedAt: new Date('2026-07-23T00:00:00Z'),
      grades: new Map([[own.id, 'A'], [foreign.id, 'B']]),
      metricValues: new Map([[own.id, 10], [foreign.id, 20]]),
    });
    const retry = await repository.publishGrades({
      organizationId: TEST_ORGANIZATION_ID,
      policy: first.policy,
      sourceCapturedAt: new Date('2026-07-23T00:00:00Z'),
      grades: new Map([[own.id, 'A']]),
      metricValues: new Map([[own.id, 10]]),
    });
    await repository.publishGrades({
      organizationId: TEST_ORGANIZATION_ID,
      policy: { ...retry.policy, metric: 'SALES_AMOUNT', periodDays: 90 },
      sourceCapturedAt: new Date('2026-07-24T00:00:00Z'),
      grades: new Map([[own.id, 'A']]),
      metricValues: new Map([[own.id, 10]]),
      allowPolicyReplacement: true,
    });
    const stale = await repository.publishGrades({
      organizationId: TEST_ORGANIZATION_ID,
      policy,
      sourceCapturedAt: new Date('2026-07-25T00:00:00Z'),
      grades: new Map([[own.id, 'B']]),
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
    await expect(prisma.masterProductAbcGradeHistory.findMany({ where: { organizationId: TEST_ORGANIZATION_ID } }))
      .resolves.toEqual([expect.objectContaining({ masterProductId: own.id, oldGrade: null, newGrade: 'A' })]);
    await expect(repository.findPolicy(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
      metric: 'SALES_AMOUNT', periodDays: 90,
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
      lastCalculatedAt: null,
      sourceCapturedAt: null,
      revision: 0,
    };
    const publish = (abcGrade: 'A' | 'B') => repository.publishGrades({
      organizationId: TEST_ORGANIZATION_ID,
      policy,
      sourceCapturedAt: new Date('2026-07-23T00:00:00Z'),
      grades: new Map([[product.id, abcGrade]]),
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
});
