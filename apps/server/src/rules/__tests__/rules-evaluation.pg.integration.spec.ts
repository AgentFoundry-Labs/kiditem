import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { RulesService } from '../services/rules.service';

let prisma: PrismaClient | null = null;

beforeAll(async () => {
  prisma = makeTestPrisma();
  await prisma.$connect();
});

afterAll(async () => prisma?.$disconnect());

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma is not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
});

describe('Rules deterministic evaluation application', () => {
  it('evaluates active products once and atomically persists all canonical projections', async () => {
    const operation = await prisma!.operationRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'rules.evaluate',
        definitionVersion: 1,
        ownerDomain: 'rules',
        title: 'Rules evaluation',
        engineType: 'domain',
        triggerSource: 'dashboard',
        requestedByUserId: TEST_USER_ID,
        input: {},
      },
    });
    const product = await prisma!.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'RULE-1',
        name: 'Rule product',
        adBudgetLimit: 5,
      },
    });
    await prisma!.businessRule.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        name: 'low-ad-budget',
        displayName: 'Low ad budget',
        category: 'advertising',
        severity: 'critical',
        field: 'adBudgetLimit',
        operator: 'lte',
        threshold: { value: 10 },
        messageTemplate: 'Budget {{value}}',
        actionType: 'review_budget',
      },
    });
    const service = makeService(operation);

    await expect(Promise.all([
      service.evaluateAndApply({ organizationId: TEST_ORGANIZATION_ID, operationId: operation.id }),
      service.evaluateAndApply({ organizationId: TEST_ORGANIZATION_ID, operationId: operation.id }),
    ])).resolves.toEqual([
      { productCount: 1, violationCount: 1, criticalCount: 1 },
      { productCount: 1, violationCount: 1, criticalCount: 1 },
    ]);

    await expect(Promise.all([
      prisma!.masterProduct.findUniqueOrThrow({ where: { id: product.id }, select: { healthScore: true } }),
      prisma!.activityEvent.count({ where: { organizationId: TEST_ORGANIZATION_ID } }),
      prisma!.alert.count({ where: { organizationId: TEST_ORGANIZATION_ID, type: 'rule_violation' } }),
      prisma!.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM rules_evaluation_applications`,
    ])).resolves.toEqual([
      { healthScore: 75 },
      1,
      1,
      [{ count: 1n }],
    ]);
  });
});

function makeService(operation: { id: string; organizationId: string; operationKey: string }) {
  return new RulesService(
    prisma as never,
    {
      get: vi.fn(async (organizationId: string, operationId: string) => {
        if (organizationId !== operation.organizationId || operationId !== operation.id) {
          throw new Error('not found');
        }
        return operation;
      }),
    } as never,
    { emit: vi.fn() } as never,
    { start: vi.fn(), succeed: vi.fn(), fail: vi.fn() } as never,
  );
}
