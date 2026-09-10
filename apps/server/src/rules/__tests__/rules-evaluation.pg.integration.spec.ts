import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  OTHER_ORGANIZATION_ID,
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
  it('evaluates and applies synchronously without the removed operation runtime', async () => {
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
    const otherProduct = await prisma!.masterProduct.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        code: 'RULE-OTHER-1',
        name: 'Other organization product',
        adBudgetLimit: 5,
      },
    });
    await prisma!.businessRule.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        name: 'low-ad-budget-other',
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
    const service = makeService();

    const result = await service.evaluateAll({
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      idempotencyKey: 'rules-evaluation-1',
    });

    expect(result).toMatchObject({
      requestId: expect.any(String),
      status: 'completed',
      productCount: 1,
      violationCount: 1,
      criticalCount: 1,
    });
    expect(result.requestId).toMatch(
      /^[0-9a-f]{64}$/,
    );

    await expect(Promise.all([
      prisma!.masterProduct.findUniqueOrThrow({ where: { id: product.id }, select: { healthScore: true } }),
      prisma!.masterProduct.findUniqueOrThrow({ where: { id: otherProduct.id }, select: { healthScore: true } }),
      prisma!.$queryRaw<Array<{ absent: boolean }>>`
        SELECT to_regclass('public.operation_runs') IS NULL AS absent
      `,
      prisma!.activityEvent.count({ where: { organizationId: TEST_ORGANIZATION_ID } }),
      prisma!.alert.count({ where: { organizationId: TEST_ORGANIZATION_ID, type: 'rule_violation' } }),
      prisma!.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM rules_evaluation_applications`,
    ])).resolves.toEqual([
      { healthScore: 75 },
      { healthScore: null },
      [{ absent: true }],
      1,
      1,
      [{ count: 1n }],
    ]);
  });

  it('replays the same Rules request without duplicating alerts or applications', async () => {
    const product = await prisma!.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'RULE-REPLAY-1',
        name: 'Replay rule product',
        adBudgetLimit: 5,
      },
    });
    await prisma!.businessRule.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        name: 'low-ad-budget-replay',
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
    const service = makeService();
    const request = {
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      idempotencyKey: 'rules-evaluation-replay',
    };

    const [first, concurrentReplay] = await Promise.all([
      service.evaluateAll(request),
      service.evaluateAll(request),
    ]);
    const completedReplay = await service.evaluateAll(request);

    expect(concurrentReplay).toEqual(first);
    expect(completedReplay).toEqual(first);
    await expect(Promise.all([
      prisma!.masterProduct.findUniqueOrThrow({ where: { id: product.id }, select: { healthScore: true } }),
      prisma!.alert.count({ where: { organizationId: TEST_ORGANIZATION_ID, type: 'rule_violation' } }),
      prisma!.rulesEvaluationApplication.count({ where: { organizationId: TEST_ORGANIZATION_ID } }),
    ])).resolves.toEqual([{ healthScore: 75 }, 1, 1]);
  });
});

function makeService() {
  return new RulesService(prisma as never);
}
