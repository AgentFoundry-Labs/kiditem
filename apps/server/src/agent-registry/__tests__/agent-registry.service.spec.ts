import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRegistryService } from '../agent-registry.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

// ── Mocks ──

function makePrisma() {
  return {
    agentDefinition: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
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
    heartbeatRun: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
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

  describe('getById tenant scope', () => {
    it('throws NotFoundException when agent belongs to a different company (IDOR guard)', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findFirst.mockResolvedValue(null);

      await expect(service.getById('def-1', 'company-OTHER')).rejects.toThrow(NotFoundException);
      expect(prisma.agentDefinition.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'def-1',
            OR: [{ companyId: 'company-OTHER' }, { companyId: null }],
          }),
        }),
      );
    });

    it('returns agent when global (companyId=null) under any tenant', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findFirst.mockResolvedValue({ ...MOCK_DEF, companyId: null });

      const result = await service.getById('def-1', 'company-1');
      expect(result.companyId).toBeNull();
    });
  });

  describe('run', () => {
    it('creates AgentTask and delegates to heartbeat wakeAgent', async () => {
      const { service, prisma, heartbeat } = makeService();
      prisma.agentDefinition.findFirst.mockResolvedValue(MOCK_DEF);
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
      prisma.agentDefinition.findFirst.mockResolvedValue({
        ...MOCK_DEF,
        monthlyTokenBudget: 1000,
        tokensUsed: 1500,
      });

      await expect(service.run('def-1')).rejects.toThrow(BadRequestException);
      expect(heartbeat.wakeAgent).not.toHaveBeenCalled();
    });
  });

  describe('pauseAgent / resumeAgent — tenant-scoped writes', () => {
    it('pauses agent with reason via updateMany binding companyId', async () => {
      const { service, prisma } = makeService();

      await service.pauseAgent('def-1', 'company-1', 'Budget review');

      expect(prisma.agentDefinition.updateMany).toHaveBeenCalledWith({
        where: { id: 'def-1', OR: [{ companyId: 'company-1' }, { companyId: null }] },
        data: expect.objectContaining({ status: 'paused', pauseReason: 'Budget review' }),
      });
    });

    it('throws NotFoundException when pause target belongs to a different company', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.pauseAgent('def-1', 'company-OTHER')).rejects.toThrow(NotFoundException);
    });

    it('resumes agent — both updates scope to (id, OR companyId)', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findFirst.mockResolvedValue({ id: 'def-1' });

      await service.resumeAgent('def-1', 'company-1');

      // status reset
      expect(prisma.agentDefinition.updateMany).toHaveBeenCalledWith({
        where: { id: 'def-1', OR: [{ companyId: 'company-1' }, { companyId: null }] },
        data: expect.objectContaining({ status: 'idle', pauseReason: null }),
      });
      // failure counter reset
      expect(prisma.agentDefinition.updateMany).toHaveBeenCalledWith({
        where: { id: 'def-1', OR: [{ companyId: 'company-1' }, { companyId: null }] },
        data: expect.objectContaining({ rtConsecutiveFailCount: 0, rtLastFailedAt: null }),
      });
    });

    it('resumeAgent throws NotFoundException when target is in a different company', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findFirst.mockResolvedValue(null);

      await expect(service.resumeAgent('def-1', 'company-OTHER')).rejects.toThrow(NotFoundException);
      // No write should happen if ownership read fails
      expect(prisma.agentDefinition.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('getRunById', () => {
    it('throws NotFoundException when run belongs to a different company', async () => {
      const { service, prisma } = makeService();
      prisma.heartbeatRun.findFirst.mockResolvedValue(null);

      await expect(service.getRunById('run-1', 'company-OTHER')).rejects.toThrow(NotFoundException);
      expect(prisma.heartbeatRun.findFirst).toHaveBeenCalledWith({
        where: { id: 'run-1', companyId: 'company-OTHER' },
      });
    });
  });

  describe('getRunHistory / getRuntimeState — agent ownership precondition', () => {
    it('getRunHistory throws when agent is not reachable under tenant', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findFirst.mockResolvedValue(null);

      await expect(service.getRunHistory('agent-1', 'company-OTHER')).rejects.toThrow(NotFoundException);
      expect(prisma.heartbeatRun.findMany).not.toHaveBeenCalled();
    });

    it('getRunHistory lists runs scoped to (agentId, companyId)', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findFirst.mockResolvedValue({ id: 'agent-1' });
      prisma.heartbeatRun.findMany.mockResolvedValue([{ id: 'run-1' }]);

      const result = await service.getRunHistory('agent-1', 'company-1', 5);

      expect(prisma.heartbeatRun.findMany).toHaveBeenCalledWith({
        where: { agentId: 'agent-1', companyId: 'company-1' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      expect(result).toHaveLength(1);
    });
  });
});
