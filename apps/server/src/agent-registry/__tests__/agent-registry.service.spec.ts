import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRegistryService } from '../agent-registry.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

// ── Mocks ──

function makePrisma() {
  return {
    agentDefinition: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn(),
    },
    agentTask: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    activityEvent: { create: vi.fn() },
    heartbeatRun: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function makeHeartbeat() {
  return {
    wakeAgent: vi.fn().mockResolvedValue({ ok: true, queued: false, wakeupId: 'w-1' }),
    syncTimers: vi.fn().mockResolvedValue(undefined),
  };
}

function makeService(prisma?: any, heartbeat?: any) {
  const p = prisma ?? makePrisma();
  const h = heartbeat ?? makeHeartbeat();
  return {
    service: new AgentRegistryService(p as any, h as any),
    prisma: p,
    heartbeat: h,
  };
}

const MOCK_DEF = {
  id: 'def-1',
  type: 'ad_strategy',
  name: '광고 전략 에이전트',
  promptTemplate: 'Task: {{task_id}}',
  allowedTools: 'Bash(psql:*) Read',
  permissionMode: 'bypassPermissions',
  adapterType: 'claude_local',
  adapterConfig: {},
  timeoutSeconds: 300,
  requiresApproval: true,
  monthlyTokenBudget: 0,
  tokensUsed: 0,
  companyId: 'company-1',
  isActive: true,
  schedule: null,
  status: 'idle',
  role: 'specialist',
  skills: [],
  permissions: {},
  runtimeConfig: {},
};

// ── Tests ──

describe('AgentRegistryService', () => {
  describe('findByType', () => {
    it('returns definition when type exists', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue(MOCK_DEF);

      const result = await service.findByType('ad_strategy');
      expect(result).toEqual(MOCK_DEF);
    });

    it('throws NotFoundException for unknown type', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue(null);

      await expect(service.findByType('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('run', () => {
    it('creates AgentTask and delegates to heartbeat wakeAgent', async () => {
      const { service, prisma, heartbeat } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue(MOCK_DEF);
      prisma.agentTask.create.mockResolvedValue({ id: 'task-1' });

      const result = await service.run('def-1', {
        companyId: 'company-1',
        dryRun: true,
        extra: { daily_budget_limit: '500,000' },
      });

      expect(result).toEqual({
        ok: true,
        taskId: 'task-1',
        agentType: 'ad_strategy',
        dryRun: true,
      });
      expect(heartbeat.wakeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'def-1',
          source: 'on_demand',
          payload: expect.objectContaining({
            dry_run: true,
            daily_budget_limit: '500,000',
          }),
        }),
      );
    });

    it('throws BadRequestException when monthly budget exceeded', async () => {
      const { service, prisma, heartbeat } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue({
        ...MOCK_DEF,
        monthlyTokenBudget: 1000,
        tokensUsed: 1500,
      });

      await expect(service.run('def-1')).rejects.toThrow(BadRequestException);
      expect(heartbeat.wakeAgent).not.toHaveBeenCalled();
    });
  });

  describe('pauseAgent / resumeAgent', () => {
    it('pauses agent with reason', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.update.mockResolvedValue({});

      await service.pauseAgent('def-1', 'Budget review');

      expect(prisma.agentDefinition.update).toHaveBeenCalledWith({
        where: { id: 'def-1' },
        data: expect.objectContaining({ status: 'paused', pauseReason: 'Budget review' }),
      });
    });

    it('resumes agent and resets consecutive fail count', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.update.mockResolvedValue({});

      await service.resumeAgent('def-1');

      expect(prisma.agentDefinition.update).toHaveBeenCalledWith({
        where: { id: 'def-1' },
        data: expect.objectContaining({ status: 'idle', pauseReason: null }),
      });
      expect(prisma.agentDefinition.updateMany).toHaveBeenCalledWith({
        where: { id: 'def-1' },
        data: expect.objectContaining({ rtConsecutiveFailCount: 0, rtLastFailedAt: null }),
      });
    });
  });
});
