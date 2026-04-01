import { describe, it, expect, vi } from 'vitest';
import { ManagerService } from '../manager.service';

function makePrisma() {
  return {
    agentTask: { findMany: vi.fn() },
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
    service: new ManagerService(prisma as any, registry as any),
    prisma,
    registry,
  };
}

describe('ManagerService', () => {
  describe('ask', () => {
    it('resolves manager definition and delegates to registry', async () => {
      const { service, registry } = makeService();
      registry.findByType.mockResolvedValue({ id: 'def-mgr', type: 'manager' });
      registry.run.mockResolvedValue({ ok: true, taskId: 'task-1', agentType: 'manager' });

      const result = await service.ask({
        companyId: 'c-1',
        request: '이 상품 왜 안 팔려?',
      });

      expect(registry.findByType).toHaveBeenCalledWith('manager');
      expect(registry.run).toHaveBeenCalledWith('def-mgr', expect.objectContaining({
        companyId: 'c-1',
        dryRun: false,
        extra: expect.objectContaining({
          company_id: 'c-1',
          user_request: '이 상품 왜 안 팔려?',
        }),
        resultApiBase: '/api/manager/results',
      }));
      expect(result.ok).toBe(true);
    });

    it('includes productId in user_request when provided', async () => {
      const { service, registry } = makeService();
      registry.findByType.mockResolvedValue({ id: 'def-mgr' });
      registry.run.mockResolvedValue({ ok: true, taskId: 'task-2' });

      await service.ask({
        companyId: 'c-1',
        request: '이 상품 분석해줘',
        productId: 'p-123',
      });

      expect(registry.run).toHaveBeenCalledWith('def-mgr', expect.objectContaining({
        extra: expect.objectContaining({
          product_id: 'p-123',
          user_request: expect.stringContaining('p-123'),
        }),
      }));
    });
  });

  describe('receiveResults', () => {
    it('creates activity event with recommendation count', async () => {
      const { service, registry, prisma } = makeService();
      registry.completeTask.mockResolvedValue({ id: 'task-1', companyId: 'c-1' });
      prisma.activityEvent.create.mockResolvedValue({});

      const result = await service.receiveResults('task-1', {
        answer: '분석 결과입니다.',
        recommendations: [
          { action: 'stop_ad', target: 'p1', reason: '적자', priority: 'high' },
          { action: 'reorder', target: 'p2', reason: '재고 부족', priority: 'medium' },
        ],
      });

      expect(result).toEqual({ ok: true });
      expect(prisma.activityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: '운영 매니저: 2건 액션 추천',
          eventType: 'manager_response',
        }),
      });
    });

    it('handles no recommendations', async () => {
      const { service, registry, prisma } = makeService();
      registry.completeTask.mockResolvedValue({ id: 'task-1', companyId: 'c-1' });
      prisma.activityEvent.create.mockResolvedValue({});

      await service.receiveResults('task-1', { answer: '현재 이상 없습니다.' });

      expect(prisma.activityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: '운영 매니저: 분석 완료',
        }),
      });
    });

    it('returns ok even when post-processing fails', async () => {
      const { service, registry, prisma } = makeService();
      registry.completeTask.mockResolvedValue({ id: 'task-1', companyId: 'c-1' });
      prisma.activityEvent.create.mockRejectedValue(new Error('DB error'));

      const result = await service.receiveResults('task-1', { answer: 'test' });

      expect(result).toEqual({ ok: true });
    });
  });
});
