import { describe, it, expect, vi } from 'vitest';
import { RulesService } from '../services/rules.service';

/**
 * rules-flow.spec.ts — end-to-end rules evaluation flow test.
 * Tests the full pipeline: evaluateAll → processEvaluationResult → healthScore update + alerts.
 *
 * Under Agent OS the @OnEvent(AGENT_EVENTS.RESULT_READY) callback is gone;
 * the runtime writes its result to AgentRun.resultJson and a bridging adapter
 * invokes RulesService.processEvaluationResult with the decoded products.
 */

function makePrisma() {
  return {
    activityEvent: { create: vi.fn(), createMany: vi.fn() },
    alert: { createManyAndReturn: vi.fn().mockResolvedValue([]) },
    channelListing: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    businessRule: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    organization: { findFirst: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  };
}

function makeAgentRunner() {
  return {
    runByType: vi.fn(),
  };
}

function makeObservability() {
  return {
    findRequest: vi.fn(),
    listRequests: vi.fn(),
    findRun: vi.fn(),
    listRuns: vi.fn(),
    listRunEvents: vi.fn(),
    listCostEvents: vi.fn(),
    listAuthorizationEvents: vi.fn(),
  };
}

function makeEventEmitter() {
  return { emit: vi.fn() };
}

function makeOperationAlerts() {
  return {
    start: vi.fn().mockResolvedValue({}),
    succeed: vi.fn().mockResolvedValue({}),
    fail: vi.fn().mockResolvedValue({}),
    progress: vi.fn().mockResolvedValue({}),
    cancel: vi.fn().mockResolvedValue({}),
  };
}

function makeService() {
  const prisma = makePrisma();
  const agentRunner = makeAgentRunner();
  const observability = makeObservability();
  const eventEmitter = makeEventEmitter();
  const operationAlerts = makeOperationAlerts();
  return {
    service: new RulesService(
      prisma as never,
      agentRunner as never,
      observability as never,
      eventEmitter as never,
      operationAlerts as never,
    ),
    prisma,
    agentRunner,
    observability,
    eventEmitter,
    operationAlerts,
  };
}

describe('RulesService — full evaluation flow', () => {
  describe('evaluateAll → AGENT_RUNNER_PORT delegation', () => {
    it('delegates rules_evaluation through AGENT_RUNNER_PORT', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: true,
        requestId: 'request-1',
        agentType: 'rules_evaluation',
        status: 'pending',
      });

      const result = await service.evaluateAll('organization-1', null);

      expect(agentRunner.runByType).toHaveBeenCalledWith('rules_evaluation', {
        organizationId: 'organization-1',
        sourceType: 'rules.evaluation',
        payload: { organization_id: 'organization-1' },
      });
      expect(result).toEqual({ requestId: 'request-1', status: 'pending' });
    });

    it('returns requestId from runner result', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: true,
        requestId: 'request-xyz',
        agentType: 'rules_evaluation',
        status: 'pending',
      });

      const result = await service.evaluateAll('organization-2', null);

      expect(result.requestId).toBe('request-xyz');
      expect(result.status).toBe('pending');
    });
  });

  describe('processEvaluationResult — full evaluation result processing', () => {
    it('updates healthScores via bulk SQL for products with violations', async () => {
      const { service, prisma } = makeService();
      prisma.$transaction.mockResolvedValue([]);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 1 });
      prisma.alert.createManyAndReturn.mockResolvedValue([]);

      await service.processEvaluationResult({
        organizationId: 'c-1',
        runId: 'run-1',
        products: [
          {
            masterId: 'p1',
            healthScore: 75,
            violations: [
              {
                ruleName: '리뷰 부족',
                field: 'reviewCount',
                severity: 'warning',
                category: 'reviews',
                message: '리뷰 5개 미만',
                actionType: null,
                value: 3,
              },
            ],
          },
        ],
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const txArg = prisma.$transaction.mock.calls[0][0];
      expect(Array.isArray(txArg)).toBe(true);
      expect(prisma.channelListing.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', organizationId: 'c-1' },
        data: expect.objectContaining({ healthScore: 75 }),
      });
    });

    it('creates activity events for each violation', async () => {
      const { service, prisma } = makeService();
      prisma.$transaction.mockResolvedValue([]);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 2 });
      prisma.alert.createManyAndReturn.mockResolvedValue([]);

      await service.processEvaluationResult({
        organizationId: 'c-1',
        runId: 'run-2',
        products: [
          {
            masterId: 'p1',
            healthScore: 60,
            violations: [
              {
                ruleName: '리뷰 부족',
                field: 'reviewCount',
                severity: 'warning',
                category: 'reviews',
                message: '리뷰 5개 미만',
                actionType: null,
                value: 3,
              },
            ],
          },
          {
            masterId: 'p2',
            healthScore: 40,
            violations: [
              {
                ruleName: '이미지 없음',
                field: 'imageCount',
                severity: 'warning',
                category: 'content',
                message: '이미지가 없습니다',
                actionType: 'add_image',
                value: 0,
              },
            ],
          },
        ],
      });

      expect(prisma.activityEvent.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ objectId: 'p1', title: '리뷰 5개 미만', eventType: 'rule_violation' }),
          expect.objectContaining({ objectId: 'p2', title: '이미지가 없습니다', eventType: 'rule_violation' }),
        ]),
      });
    });

    it('creates critical alerts only for critical severity violations', async () => {
      const { service, prisma } = makeService();
      prisma.$transaction.mockResolvedValue([]);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 2 });
      prisma.alert.createManyAndReturn.mockResolvedValue([
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          organizationId: 'c-1',
          targetType: 'listing',
          targetId: 'p2',
          type: 'rule_violation',
          severity: 'critical',
          title: '순이익률 -10%',
          message: 'review_pricing',
          isRead: false,
          actionTaskId: null,
          createdAt: new Date(),
        },
      ]);

      await service.processEvaluationResult({
        organizationId: 'c-1',
        runId: 'run-3',
        products: [
          {
            masterId: 'p1',
            healthScore: 85,
            violations: [
              {
                ruleName: '리뷰 부족',
                field: 'reviewCount',
                severity: 'warning',
                category: 'reviews',
                message: '리뷰 5개 미만',
                actionType: null,
                value: 3,
              },
            ],
          },
          {
            masterId: 'p2',
            healthScore: 20,
            violations: [
              {
                ruleName: '적자 상품',
                field: 'profitRate',
                severity: 'critical',
                category: 'profitability',
                message: '순이익률 -10%',
                actionType: 'review_pricing',
                value: -10,
              },
            ],
          },
        ],
      });

      // Only critical violation (p2) should create an alert
      expect(prisma.alert.createManyAndReturn).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            targetType: 'listing',
            targetId: 'p2',
            severity: 'critical',
            title: '순이익률 -10%',
          }),
        ],
      });
    });

    it('does not create alerts when no critical violations exist', async () => {
      const { service, prisma } = makeService();
      prisma.$transaction.mockResolvedValue([]);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 1 });

      await service.processEvaluationResult({
        organizationId: 'c-1',
        runId: 'run-4',
        products: [
          {
            masterId: 'p1',
            healthScore: 70,
            violations: [
              {
                ruleName: '리뷰 부족',
                field: 'reviewCount',
                severity: 'warning',
                category: 'reviews',
                message: '리뷰 5개 미만',
                actionType: null,
                value: 3,
              },
            ],
          },
        ],
      });

      expect(prisma.alert.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('skips all DB operations when products array is empty', async () => {
      const { service, prisma } = makeService();

      await service.processEvaluationResult({
        organizationId: 'c-1',
        runId: 'run-5',
        products: [],
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.activityEvent.createMany).not.toHaveBeenCalled();
      expect(prisma.alert.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('does not throw when DB operations fail (error recovery)', async () => {
      const { service, prisma } = makeService();
      prisma.$transaction.mockRejectedValue(new Error('SQL execution failed'));

      await expect(
        service.processEvaluationResult({
          organizationId: 'c-1',
          runId: 'run-7',
          products: [
            {
              masterId: 'p1',
              healthScore: 50,
              violations: [
                {
                  ruleName: '테스트 룰',
                  field: 'testField',
                  severity: 'warning',
                  category: 'test',
                  message: '테스트 메시지',
                  actionType: null,
                  value: 0,
                },
              ],
            },
          ],
        }),
      ).resolves.not.toThrow();
    });

    it('includes actionType in activity event data when present', async () => {
      const { service, prisma } = makeService();
      prisma.$transaction.mockResolvedValue([]);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 1 });

      await service.processEvaluationResult({
        organizationId: 'c-1',
        runId: 'run-8',
        products: [
          {
            masterId: 'p1',
            healthScore: 30,
            violations: [
              {
                ruleName: '가격 오류',
                field: 'price',
                severity: 'critical',
                category: 'pricing',
                message: '가격이 너무 낮습니다',
                actionType: 'review_pricing',
                value: 100,
              },
            ],
          },
        ],
      });

      expect(prisma.activityEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            data: expect.objectContaining({
              actionType: 'review_pricing',
              severity: 'critical',
            }),
          }),
        ],
      });
    });
  });

  describe('suggestThresholds → AGENT_RUNNER_PORT delegation', () => {
    it('delegates rules_suggest through AGENT_RUNNER_PORT', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({
        ok: true,
        requestId: 'request-s1',
        agentType: 'rules_suggest',
        status: 'pending',
      });

      const result = await service.suggestThresholds('organization-1', null);

      expect(agentRunner.runByType).toHaveBeenCalledWith('rules_suggest', {
        organizationId: 'organization-1',
        sourceType: 'rules.suggest',
        payload: { organization_id: 'organization-1' },
      });
      expect(result).toEqual({ requestId: 'request-s1', status: 'pending' });
    });
  });
});
