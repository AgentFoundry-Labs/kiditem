import { describe, it, expect, vi } from 'vitest';
import { ManagerService } from '../agent/manager.service';
import { AgentResultReadyEvent } from '../../../../agent-registry/events/agent-events';

function makePrisma() {
  return {
    agentTask: { findMany: vi.fn() },
    activityEvent: { create: vi.fn() },
  };
}

function makeAgentRunner() {
  return {
    runByType: vi.fn().mockResolvedValue({ ok: true }),
  };
}

function makeService() {
  const prisma = makePrisma();
  const agentRunner = makeAgentRunner();
  return {
    service: new ManagerService(prisma as any, agentRunner as any),
    prisma,
    agentRunner,
  };
}

describe('ManagerService', () => {
  describe('ask', () => {
    it('delegates to agent runner port', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({ ok: true, taskId: 'task-1', agentType: 'manager' });

      const result = await service.ask({
        companyId: 'c-1',
        request: '이 상품 왜 안 팔려?',
      });

      expect(agentRunner.runByType).toHaveBeenCalledWith('manager', expect.objectContaining({
        companyId: 'c-1',
        dryRun: false,
        extra: expect.objectContaining({
          company_id: 'c-1',
          user_request: '이 상품 왜 안 팔려?',
        }),
      }));
      expect(result.ok).toBe(true);
    });

    it('includes productId in user_request when provided', async () => {
      const { service, agentRunner } = makeService();
      agentRunner.runByType.mockResolvedValue({ ok: true, taskId: 'task-2' });

      await service.ask({
        companyId: 'c-1',
        request: '이 상품 분석해줘',
        productId: 'p-123',
      });

      expect(agentRunner.runByType).toHaveBeenCalledWith('manager', expect.objectContaining({
        extra: expect.objectContaining({
          product_id: 'p-123',
          user_request: expect.stringContaining('p-123'),
        }),
      }));
    });
  });

  describe('onResultReady', () => {
    it('dispatches recommended agents and creates activity event', async () => {
      const { service, agentRunner, prisma } = makeService();
      prisma.activityEvent.create.mockResolvedValue({});

      const event = new AgentResultReadyEvent(
        'manager', 'agent-mgr', 'run-1',
        {
          analysis: '분석 결과',
          recommended_agents: ['ad_strategy', 'rules_evaluation'],
        },
        'c-1',
      );

      await service.onResultReady(event);

      expect(agentRunner.runByType).toHaveBeenCalledTimes(2);
      expect(agentRunner.runByType).toHaveBeenCalledWith('ad_strategy', { companyId: 'c-1' });
      expect(agentRunner.runByType).toHaveBeenCalledWith('rules_evaluation', { companyId: 'c-1' });
      expect(prisma.activityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: '운영 매니저: 2건 에이전트 실행',
          eventType: 'manager_response',
        }),
      });
    });

    it('handles no recommended agents', async () => {
      const { service, agentRunner, prisma } = makeService();
      prisma.activityEvent.create.mockResolvedValue({});

      const event = new AgentResultReadyEvent(
        'manager', 'agent-mgr', 'run-2',
        { analysis: '현재 이상 없습니다.', recommended_agents: [] },
        'c-1',
      );

      await service.onResultReady(event);

      expect(agentRunner.runByType).not.toHaveBeenCalled();
      expect(prisma.activityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: '운영 매니저: 분석 완료',
        }),
      });
    });

    it('ignores non-manager events', async () => {
      const { service, prisma } = makeService();

      const event = new AgentResultReadyEvent(
        'ad_strategy', 'agent-ad', 'run-3', {}, 'c-1',
      );

      await service.onResultReady(event);

      expect(prisma.activityEvent.create).not.toHaveBeenCalled();
    });

    it('does not throw when post-processing fails', async () => {
      const { service, prisma } = makeService();
      prisma.activityEvent.create.mockRejectedValue(new Error('DB error'));

      const event = new AgentResultReadyEvent(
        'manager', 'agent-mgr', 'run-4',
        { analysis: 'test', recommended_agents: [] },
        'c-1',
      );

      await service.onResultReady(event);
    });
  });
});
