import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRegistryService } from '../agent-registry.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AgentCostAnalyticsService } from '../../automation/application/service/agent-cost-analytics.service';
import { AgentCrudService } from '../../automation/application/service/agent-crud.service';
import { AgentLifecycleService } from '../../automation/application/service/agent-lifecycle.service';
import { AgentRunService } from '../../automation/application/service/agent-run.service';

// ── Mocks ──

function makePrisma() {
  return {
    agentDefinition: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
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
  const crud = new AgentCrudService(p as any, h as any);
  const runner = new AgentRunService(p as any, crud, h as any);
  const lifecycle = new AgentLifecycleService(p as any);
  const costAnalytics = new AgentCostAnalyticsService(p as any);
  return {
    service: new AgentRegistryService(
      h as any,
      crud,
      runner,
      lifecycle,
      costAnalytics,
    ),
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
        workflowRunId: '00000000-0000-0000-0000-000000000001',
        workflowNodeId: 'agent-node',
        sourceDataId: '00000000-0000-0000-0000-000000000002',
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
          companyId: 'company-1',
          source: 'on_demand',
          payload: expect.objectContaining({
            dry_run: true,
            daily_budget_limit: '500,000',
          }),
        }),
      );
      expect(prisma.agentTask.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          agentType: 'ad_strategy',
          companyId: 'company-1',
          workflowRunId: '00000000-0000-0000-0000-000000000001',
          workflowNodeId: 'agent-node',
          sourceDataId: '00000000-0000-0000-0000-000000000002',
          status: 'running',
          input: expect.objectContaining({
            definitionId: 'def-1',
            daily_budget_limit: '500,000',
          }),
        }),
      });
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

  describe('pauseAgent / resumeAgent — tenant-owned writes (denies global)', () => {
    it('pauses agent with reason via updateMany binding companyId', async () => {
      const { service, prisma } = makeService();

      await service.pauseAgent('def-1', 'company-1', 'Budget review');

      expect(prisma.agentDefinition.updateMany).toHaveBeenCalledWith({
        where: { id: 'def-1', companyId: 'company-1' },
        data: expect.objectContaining({ status: 'paused', pauseReason: 'Budget review' }),
      });
    });

    it('throws NotFoundException when pause target belongs to a different company', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.pauseAgent('def-1', 'company-OTHER')).rejects.toThrow(NotFoundException);
    });

    it('rejects pause on global definition (companyId=null) — tenant cannot mutate platform template', async () => {
      const { service, prisma } = makeService();
      // updateMany with companyId binding returns 0 because the row's companyId is null
      prisma.agentDefinition.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.pauseAgent('def-global', 'company-1')).rejects.toThrow(NotFoundException);
      // Confirm the WHERE clause would never match a null companyId row
      expect(prisma.agentDefinition.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'def-global', companyId: 'company-1' },
        }),
      );
    });

    it('resumes agent — both updates scope to (id, companyId) only', async () => {
      const { service, prisma } = makeService();

      await service.resumeAgent('def-1', 'company-1');

      // status reset
      expect(prisma.agentDefinition.updateMany).toHaveBeenCalledWith({
        where: { id: 'def-1', companyId: 'company-1' },
        data: expect.objectContaining({ status: 'idle', pauseReason: null }),
      });
      // failure counter reset
      expect(prisma.agentDefinition.updateMany).toHaveBeenCalledWith({
        where: { id: 'def-1', companyId: 'company-1' },
        data: expect.objectContaining({ rtConsecutiveFailCount: 0, rtLastFailedAt: null }),
      });
    });

    it('resumeAgent throws NotFoundException when status updateMany returns count=0 (different company OR global)', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.resumeAgent('def-1', 'company-OTHER')).rejects.toThrow(NotFoundException);
      // The first updateMany failed → no second updateMany should fire.
      expect(prisma.agentDefinition.updateMany).toHaveBeenCalledTimes(1);
    });

    it('resetSession denies global definition — only tenant-owned rt_session_id is mutable', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.resetSession('def-global', 'company-1')).rejects.toThrow(NotFoundException);
      expect(prisma.agentDefinition.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'def-global', companyId: 'company-1' },
          data: expect.objectContaining({ rtSessionId: null }),
        }),
      );
    });
  });

  describe('update / delete — tenant-owned writes (denies global)', () => {
    it('update binds companyId in the actual mutation (not just pre-read)', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.updateMany.mockResolvedValue({ count: 1 });
      prisma.agentDefinition.findFirstOrThrow.mockResolvedValue({ ...MOCK_DEF, name: 'updated' });

      await service.update('def-1', 'company-1', { name: 'updated' });

      expect(prisma.agentDefinition.updateMany).toHaveBeenCalledWith({
        where: { id: 'def-1', companyId: 'company-1' },
        data: expect.objectContaining({ name: 'updated' }),
      });
      // Reload also bound
      expect(prisma.agentDefinition.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: 'def-1', companyId: 'company-1' },
      });
      // No bare-id update was issued
      expect(prisma.agentDefinition.update).not.toHaveBeenCalled();
    });

    it('update rejects global definition — count=0 throws NotFoundException', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update('def-global', 'company-1', { name: 'tenant-attempt' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.agentDefinition.findFirstOrThrow).not.toHaveBeenCalled();
    });

    it('delete binds companyId in the actual mutation', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.deleteMany.mockResolvedValue({ count: 1 });

      await service.delete('def-1', 'company-1');

      expect(prisma.agentDefinition.deleteMany).toHaveBeenCalledWith({
        where: { id: 'def-1', companyId: 'company-1' },
      });
      // No bare-id delete was issued
      expect(prisma.agentDefinition.delete).not.toHaveBeenCalled();
    });

    it('delete rejects global definition — count=0 throws NotFoundException', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.delete('def-global', 'company-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('run — AgentTask first-class trace fields', () => {
    it('persists workflowRunId / workflowNodeId / sourceDataId as dedicated columns (not buried in input)', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findFirst.mockResolvedValue(MOCK_DEF);
      prisma.agentTask.create.mockResolvedValue({ id: 'task-1' });

      await service.run('def-1', {
        companyId: 'company-1',
        workflowRunId: '00000000-0000-0000-0000-0000000000aa',
        workflowNodeId: 'agent-node',
        sourceDataId: '00000000-0000-0000-0000-0000000000bb',
      });

      const createCall = prisma.agentTask.create.mock.calls[0][0];
      expect(createCall.data.companyId).toBe('company-1');
      expect(createCall.data.workflowRunId).toBe('00000000-0000-0000-0000-0000000000aa');
      expect(createCall.data.workflowNodeId).toBe('agent-node');
      expect(createCall.data.sourceDataId).toBe('00000000-0000-0000-0000-0000000000bb');
      // First-class fields must NOT also be smuggled inside `input`.
      expect(createCall.data.input.workflowRunId).toBeUndefined();
      expect(createCall.data.input.workflowNodeId).toBeUndefined();
      expect(createCall.data.input.sourceDataId).toBeUndefined();
    });

    it('uses caller-supplied (trusted) companyId on AgentTask, not the definition’s', async () => {
      const { service, prisma } = makeService();
      // Global definition (companyId=null) invoked with a tenant-bound caller.
      prisma.agentDefinition.findFirst.mockResolvedValue({ ...MOCK_DEF, companyId: null });
      prisma.agentTask.create.mockResolvedValue({ id: 'task-1' });

      await service.run('def-1', { companyId: 'company-1' });

      const createCall = prisma.agentTask.create.mock.calls[0][0];
      expect(createCall.data.companyId).toBe('company-1');
    });

    it('falls back to def.companyId when caller supplies no companyId (internal callers)', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findFirst.mockResolvedValue(MOCK_DEF);
      prisma.agentTask.create.mockResolvedValue({ id: 'task-1' });

      await service.run('def-1');

      const createCall = prisma.agentTask.create.mock.calls[0][0];
      expect(createCall.data.companyId).toBe('company-1');
    });

    it('extra payload still merges into input JSON (backward compat envelope)', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findFirst.mockResolvedValue(MOCK_DEF);
      prisma.agentTask.create.mockResolvedValue({ id: 'task-1' });

      await service.run('def-1', {
        companyId: 'company-1',
        extra: { legacy_threshold: 7 },
      });

      const createCall = prisma.agentTask.create.mock.calls[0][0];
      expect(createCall.data.input.legacy_threshold).toBe(7);
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
