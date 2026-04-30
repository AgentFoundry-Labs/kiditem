import { describe, it, expect, vi } from 'vitest';
import { AdStrategyAgentService } from '../ad-strategy-agent.service';
import { AgentResultReadyEvent } from '../../../../agent-registry/events/agent-events';

function makePrisma() {
  return {
    agentTask: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    activityEvent: { create: vi.fn() },
  };
}

function makeAgentRunner() {
  return {
    runByType: vi.fn(),
  };
}

function makeService() {
  const prisma = makePrisma();
  const agentRunner = makeAgentRunner();
  return {
    service: new AdStrategyAgentService(prisma as any, agentRunner as any),
    prisma,
    agentRunner,
  };
}

describe('AdStrategyAgentService', () => {
  describe('run', () => {
    it('delegates to agent runner port for ad_strategy', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({ ok: true, taskId: 'task-1', agentType: 'ad_strategy' });

      const result = await service.run({ companyId: 'c-1', dryRun: true });

      expect(agentRunner.runByType).toHaveBeenCalledWith('ad_strategy', {
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
