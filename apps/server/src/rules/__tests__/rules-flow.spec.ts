import { describe, it, expect, vi } from 'vitest';
import { RulesService } from '../services/rules.service';
import { AgentResultReadyEvent } from '../../agent-registry/events/agent-events';

/**
 * rules-flow.spec.ts — end-to-end rules evaluation flow test.
 * Tests the full pipeline: evaluateAll → onResultReady → healthScore update + alerts.
 */

function makePrisma() {
  return {
    agentTask: { findUnique: vi.fn(), update: vi.fn() },
    activityEvent: { create: vi.fn(), createMany: vi.fn() },
    alert: { createManyAndReturn: vi.fn().mockResolvedValue([]) },
    masterProduct: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    businessRule: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    company: { findFirst: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  };
}

function makeAgentRunner() {
  return {
    runByType: vi.fn(),
  };
}

function makeEventEmitter() {
  return { emit: vi.fn() };
}

function makeService() {
  const prisma = makePrisma();
  const agentRunner = makeAgentRunner();
  const eventEmitter = makeEventEmitter();
  return {
    service: new RulesService(prisma as any, agentRunner as any, eventEmitter as any),
    prisma,
    agentRunner,
    eventEmitter,
  };
}

describe('RulesService — full evaluation flow', () => {
  describe('evaluateAll → agent run delegation', () => {
    it('delegates rules_evaluation through the automation agent runner port', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({ ok: true, taskId: 'task-1', agentType: 'rules_evaluation' });

      const result = await service.evaluateAll('company-1');

      expect(agentRunner.runByType).toHaveBeenCalledWith('rules_evaluation', {
        companyId: 'company-1',
        extra: { company_id: 'company-1' },
      });
      expect(result).toEqual({ taskId: 'task-1', status: 'running' });
    });

    it('returns taskId from runner result', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({ ok: true, taskId: 'task-xyz', agentType: 'rules_evaluation' });

      const result = await service.evaluateAll('company-2');

      expect(result.taskId).toBe('task-xyz');
      expect(result.status).toBe('running');
    });
  });

  describe('onResultReady — full evaluation result processing', () => {
    it('updates healthScores via bulk SQL for products with violations', async () => {
      const { service, prisma } = makeService();
      prisma.$transaction.mockResolvedValue([]);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 1 });
      prisma.alert.createManyAndReturn.mockResolvedValue([]);

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-1',
        {
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
          summary: { total: 1 },
        },
        'c-1',
      );

      await service.onResultReady(event);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const txArg = prisma.$transaction.mock.calls[0][0];
      expect(Array.isArray(txArg)).toBe(true);
      expect(prisma.masterProduct.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', companyId: 'c-1' },
        data: expect.objectContaining({ healthScore: 75 }),
      });
    });

    it('creates activity events for each violation', async () => {
      const { service, prisma } = makeService();
      prisma.$transaction.mockResolvedValue([]);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 2 });
      prisma.alert.createManyAndReturn.mockResolvedValue([]);

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-2',
        {
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
          summary: { total: 2 },
        },
        'c-1',
      );

      await service.onResultReady(event);

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
      prisma.alert.createManyAndReturn.mockResolvedValue([{
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        companyId: 'c-1',
        targetType: 'master',
        targetId: 'p2',
        type: 'rule_violation',
        severity: 'critical',
        title: '순이익률 -10%',
        message: 'review_pricing',
        isRead: false,
        actionTaskId: null,
        createdAt: new Date(),
      }]);

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-3',
        {
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
          summary: { total: 2 },
        },
        'c-1',
      );

      await service.onResultReady(event);

      // Only critical violation (p2) should create an alert
      expect(prisma.alert.createManyAndReturn).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            targetType: 'master',
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

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-4',
        {
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
          summary: { total: 1 },
        },
        'c-1',
      );

      await service.onResultReady(event);

      expect(prisma.alert.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('skips all DB operations when products array is empty', async () => {
      const { service, prisma } = makeService();

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-5',
        { products: [], summary: { total: 0 } },
        'c-1',
      );

      await service.onResultReady(event);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.activityEvent.createMany).not.toHaveBeenCalled();
      expect(prisma.alert.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('ignores events from non-rules_evaluation agent types', async () => {
      const { service, prisma } = makeService();

      const event = new AgentResultReadyEvent(
        'ad_strategy', 'agent-ad', 'run-6', {}, 'c-1',
      );

      await service.onResultReady(event);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.activityEvent.createMany).not.toHaveBeenCalled();
      expect(prisma.alert.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('does not throw when DB operations fail (error recovery)', async () => {
      const { service, prisma } = makeService();
      prisma.$transaction.mockRejectedValue(new Error('SQL execution failed'));

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-7',
        {
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
        },
        'c-1',
      );

      // Should not throw — service catches and logs the error
      await expect(service.onResultReady(event)).resolves.not.toThrow();
    });

    it('includes actionType in activity event data when present', async () => {
      const { service, prisma } = makeService();
      prisma.$transaction.mockResolvedValue([]);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 1 });

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-8',
        {
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
          summary: { total: 1 },
        },
        'c-1',
      );

      await service.onResultReady(event);

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

  describe('suggestThresholds → agent run delegation', () => {
    it('delegates rules_suggest through the automation agent runner port', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({ ok: true, taskId: 'task-s1' });

      const result = await service.suggestThresholds('company-1');

      expect(agentRunner.runByType).toHaveBeenCalledWith('rules_suggest', {
        companyId: 'company-1',
        extra: { company_id: 'company-1' },
      });
      expect(result).toEqual({ taskId: 'task-s1', status: 'running' });
    });
  });
});
