import { describe, it, expect, vi } from 'vitest';
import { RulesService } from '../services/rules.service';
import { AgentResultReadyEvent } from '../../agent-registry/events/agent-events';

function makePrisma() {
  return {
    agentTask: { findUnique: vi.fn(), update: vi.fn() },
    activityEvent: { create: vi.fn(), createMany: vi.fn() },
    alert: { createMany: vi.fn() },
    product: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    businessRule: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    company: { findFirst: vi.fn() },
    $executeRawUnsafe: vi.fn(),
  };
}

function makeAgentRegistry() {
  return {
    findByType: vi.fn(),
    run: vi.fn(),
  };
}

function makeService() {
  const prisma = makePrisma();
  const registry = makeAgentRegistry();
  return {
    service: new RulesService(prisma as any, registry as any),
    prisma,
    registry,
  };
}

describe('RulesService', () => {
  describe('evaluateAll', () => {
    it('resolves rules_evaluation definition and delegates to registry', async () => {
      const { service, registry } = makeService();
      registry.findByType.mockResolvedValue({ id: 'def-rules' });
      registry.run.mockResolvedValue({ ok: true, taskId: 'task-1', agentType: 'rules_evaluation' });

      const result = await service.evaluateAll('company-1');

      expect(registry.findByType).toHaveBeenCalledWith('rules_evaluation');
      expect(registry.run).toHaveBeenCalledWith('def-rules', {
        companyId: 'company-1',
        extra: { company_id: 'company-1' },
      });
      expect(result).toEqual({ taskId: 'task-1', status: 'running' });
    });
  });

  describe('onResultReady', () => {
    it('updates healthScores, creates events, and creates critical alerts', async () => {
      const { service, prisma } = makeService();
      prisma.$executeRawUnsafe.mockResolvedValue(undefined);
      prisma.activityEvent.createMany.mockResolvedValue({ count: 2 });
      prisma.alert.createMany.mockResolvedValue({ count: 1 });

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-1',
        {
          products: [
            {
              productId: 'p1',
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
              productId: 'p2',
              healthScore: 25,
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

      // healthScore bulk update
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("WHEN id = 'p1'::uuid THEN 85"),
      );

      // activity events
      expect(prisma.activityEvent.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ objectId: 'p1', title: '리뷰 5개 미만' }),
          expect.objectContaining({ objectId: 'p2', title: '순이익률 -10%' }),
        ]),
      });

      // critical alerts
      expect(prisma.alert.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({
          productId: 'p2',
          severity: 'critical',
          title: '순이익률 -10%',
        })],
      });
    });

    it('handles empty products array gracefully', async () => {
      const { service, prisma } = makeService();

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-2',
        { products: [], summary: { total: 0 } },
        'c-1',
      );

      await service.onResultReady(event);

      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(prisma.activityEvent.createMany).not.toHaveBeenCalled();
      expect(prisma.alert.createMany).not.toHaveBeenCalled();
    });

    it('ignores non-rules_evaluation events', async () => {
      const { service, prisma } = makeService();

      const event = new AgentResultReadyEvent(
        'ad_strategy', 'agent-ad', 'run-3', {}, 'c-1',
      );

      await service.onResultReady(event);

      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('does not throw when post-processing fails', async () => {
      const { service, prisma } = makeService();
      prisma.$executeRawUnsafe.mockRejectedValue(new Error('SQL error'));

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-4',
        {
          products: [{
            productId: 'p1',
            healthScore: 50,
            violations: [],
          }],
        },
        'c-1',
      );

      // Should not throw
      await service.onResultReady(event);
    });
  });

  describe('suggestThresholds', () => {
    it('resolves rules_suggest definition and delegates', async () => {
      const { service, registry } = makeService();
      registry.findByType.mockResolvedValue({ id: 'def-suggest' });
      registry.run.mockResolvedValue({ ok: true, taskId: 'task-s1' });

      const result = await service.suggestThresholds('company-1');

      expect(registry.findByType).toHaveBeenCalledWith('rules_suggest');
      expect(result).toEqual({ taskId: 'task-s1', status: 'running' });
    });
  });
});
