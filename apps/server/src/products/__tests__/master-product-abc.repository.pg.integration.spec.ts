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
    const policy = { metric: 'SALES_QUANTITY' as const, periodDays: 30 as const, aCumulativeThreshold: 70, bCumulativeThreshold: 90, lastCalculatedAt: null, sourceCapturedAt: null };

    const first = await repository.publishGrades({
      organizationId: TEST_ORGANIZATION_ID,
      policy,
      sourceCapturedAt: new Date('2026-07-23T00:00:00Z'),
      grades: new Map([[own.id, 'A'], [foreign.id, 'B']]),
      metricValues: new Map([[own.id, 10], [foreign.id, 20]]),
    });
    const retry = await repository.publishGrades({
      organizationId: TEST_ORGANIZATION_ID,
      policy,
      sourceCapturedAt: new Date('2026-07-23T00:00:00Z'),
      grades: new Map([[own.id, 'A']]),
      metricValues: new Map([[own.id, 10]]),
    });

    expect(first.changedProductCount).toBe(1);
    expect(retry.changedProductCount).toBe(0);
    expect((await prisma.masterProduct.findUniqueOrThrow({ where: { id: own.id } })).abcGrade).toBe('A');
    expect((await prisma.masterProduct.findUniqueOrThrow({ where: { id: foreign.id } })).abcGrade).toBeNull();
    await expect(prisma.masterProductAbcGradeHistory.findMany({ where: { organizationId: TEST_ORGANIZATION_ID } }))
      .resolves.toEqual([expect.objectContaining({ masterProductId: own.id, oldGrade: null, newGrade: 'A' })]);
  });
});
