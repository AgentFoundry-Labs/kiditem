import { describe, it, expect, vi } from 'vitest';
import { AdStrategyService } from '../ad-strategy.service';
import { AgentResultReadyEvent } from '../../../events/agent-events';

function makePrisma() {
  return {
    agentTask: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    activityEvent: { create: vi.fn() },
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
    service: new AdStrategyService(prisma as any, registry as any),
    prisma,
    registry,
  };
}

describe('AdStrategyService', () => {
  describe('run', () => {
    it('resolves ad_strategy definition and delegates to registry', async () => {
      const { service, registry } = makeService();
      registry.findByType.mockResolvedValue({ id: 'def-ad', type: 'ad_strategy' });
      registry.run.mockResolvedValue({ ok: true, taskId: 'task-1', agentType: 'ad_strategy', dryRun: true });

      const result = await service.run({ companyId: 'c-1', dryRun: true });

      expect(registry.findByType).toHaveBeenCalledWith('ad_strategy');
      expect(registry.run).toHaveBeenCalledWith('def-ad', {
        companyId: 'c-1',
        dryRun: true,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('onResultReady', () => {
    it('creates domain activity event for ad_strategy results', async () => {
      const { service, prisma } = makeService();
      prisma.activityEvent.create.mockResolvedValue({});

      const event = new AgentResultReadyEvent(
        'ad_strategy', 'agent-1', 'run-1',
        {
          actions: [
            { action: 'stop_ad', product_id: 'p1' },
            { action: 'increase_budget', product_id: 'p2' },
            { action: 'stop_ad', product_id: 'p3' },
          ],
          summary: { total: 3 },
        },
        'c-1',
      );

      await service.onResultReady(event);

      expect(prisma.activityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: '광고 전략 실행: 3건 (중단 2)',
          eventType: 'ad_strategy',
        }),
      });
    });

    it('ignores non-ad_strategy events', async () => {
      const { service, prisma } = makeService();

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-2', 'run-2', {}, 'c-1',
      );

      await service.onResultReady(event);

      expect(prisma.activityEvent.create).not.toHaveBeenCalled();
    });

    it('does not throw when post-processing fails', async () => {
      const { service, prisma } = makeService();
      prisma.activityEvent.create.mockRejectedValue(new Error('DB error'));

      const event = new AgentResultReadyEvent(
        'ad_strategy', 'agent-1', 'run-1',
        { actions: [] },
        'c-1',
      );

      // Should not throw
      await service.onResultReady(event);
    });
  });
});
