import { describe, it, expect, vi } from 'vitest';
import { AdStrategyService } from '../ad-strategy.service';

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
    completeTask: vi.fn(),
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
        resultApiBase: '/api/ad-agent/results',
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('receiveResults', () => {
    it('calls completeTask then creates domain activity event', async () => {
      const { service, registry, prisma } = makeService();
      registry.completeTask.mockResolvedValue({ id: 'task-1', companyId: 'c-1' });
      prisma.activityEvent.create.mockResolvedValue({});

      const body = {
        actions: [
          { action: 'stop_ad', product_id: 'p1' },
          { action: 'increase_budget', product_id: 'p2' },
          { action: 'stop_ad', product_id: 'p3' },
        ],
        summary: { total: 3 },
      };

      const result = await service.receiveResults('task-1', body);

      expect(result).toEqual({ ok: true });
      expect(prisma.activityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: '광고 전략 실행: 3건 (중단 2)',
          eventType: 'ad_strategy',
        }),
      });
    });

    it('does not create activity event when no companyId', async () => {
      const { service, registry, prisma } = makeService();
      registry.completeTask.mockResolvedValue({ id: 'task-1', companyId: null });

      await service.receiveResults('task-1', { actions: [] });

      expect(prisma.activityEvent.create).not.toHaveBeenCalled();
    });

    it('returns ok even when post-processing fails', async () => {
      const { service, registry, prisma } = makeService();
      registry.completeTask.mockResolvedValue({ id: 'task-1', companyId: 'c-1' });
      prisma.activityEvent.create.mockRejectedValue(new Error('DB error'));

      const result = await service.receiveResults('task-1', { actions: [] });

      expect(result).toEqual({ ok: true });
    });
  });
});
