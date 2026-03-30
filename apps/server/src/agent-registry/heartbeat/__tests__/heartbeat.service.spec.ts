import { describe, it, expect, vi } from 'vitest';
import { HeartbeatService } from '../heartbeat.service';

function makePrisma() {
  return {
    agentDefinition: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    agentRuntimeState: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    heartbeatRun: {
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

function makeWakeup() {
  return {
    requestWakeup: vi.fn(),
    claimNext: vi.fn(),
    finish: vi.fn(),
  };
}

function makeSkills() {
  return {
    buildSkillsDir: vi.fn().mockResolvedValue(null),
    cleanup: vi.fn(),
  };
}

function makeScheduler() {
  return {
    getCronJobs: vi.fn().mockReturnValue(new Map()),
    addCronJob: vi.fn(),
    deleteCronJob: vi.fn(),
    getIntervals: vi.fn().mockReturnValue([]),
    addInterval: vi.fn(),
    deleteInterval: vi.fn(),
  };
}

function makeService() {
  const prisma = makePrisma();
  const wakeup = makeWakeup();
  const skills = makeSkills();
  const scheduler = makeScheduler();
  return {
    service: new HeartbeatService(prisma as any, wakeup as any, skills as any, scheduler as any),
    prisma,
    wakeup,
    skills,
    scheduler,
  };
}

const MOCK_AGENT = {
  id: 'agent-1',
  companyId: 'c-1',
  name: '광고 전략 에이전트',
  type: 'ad_strategy',
  status: 'idle',
  adapterType: 'claude_local',
  adapterConfig: { command: 'claude' },
  runtimeConfig: {},
  promptTemplate: 'Task: {{task_id}}',
  allowedTools: 'Bash(psql:*) Read',
  permissionMode: 'bypassPermissions',
  timeoutSeconds: 300,
  monthlyTokenBudget: 0,
  tokensUsed: 0,
  skills: ['db-query'],
  permissions: {},
  schedule: null,
  requiresApproval: true,
  isActive: true,
};

describe('HeartbeatService', () => {
  describe('wakeAgent', () => {
    it('rejects when agent is paused', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue({ ...MOCK_AGENT, status: 'paused' });

      const result = await service.wakeAgent({ agentId: 'agent-1', source: 'on_demand' });

      expect(result).toEqual({ ok: false, error: 'agent_paused', agentId: 'agent-1' });
    });

    it('rejects when budget exceeded', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue({
        ...MOCK_AGENT,
        monthlyTokenBudget: 1000,
        tokensUsed: 1500,
      });

      const result = await service.wakeAgent({ agentId: 'agent-1', source: 'on_demand' });

      expect(result).toEqual({ ok: false, error: 'budget_exceeded', agentId: 'agent-1' });
    });

    it('creates wakeup request and triggers execution', async () => {
      const { service, prisma, wakeup } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue(MOCK_AGENT);
      wakeup.requestWakeup.mockResolvedValue({ id: 'w-1' });

      // Mock the internal executeHeartbeat to prevent actual execution
      wakeup.claimNext.mockResolvedValue(null);

      const result = await service.wakeAgent({
        agentId: 'agent-1',
        source: 'on_demand',
        reason: 'Manual trigger',
      });

      expect(result.ok).toBe(true);
      expect(wakeup.requestWakeup).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          source: 'on_demand',
          reason: 'Manual trigger',
        }),
      );
    });
  });

  describe('syncTimers', () => {
    it('registers cron jobs for agents with schedule', async () => {
      const { service, prisma, scheduler } = makeService();
      prisma.agentDefinition.findMany.mockResolvedValue([
        { ...MOCK_AGENT, schedule: '0 9 * * *' },
      ]);

      await service.syncTimers();

      expect(scheduler.addCronJob).toHaveBeenCalledWith(
        'heartbeat-timer-agent-1',
        expect.anything(),
      );
    });

    it('registers intervals for agents with intervalSec', async () => {
      const { service, prisma, scheduler } = makeService();
      prisma.agentDefinition.findMany.mockResolvedValue([
        { ...MOCK_AGENT, runtimeConfig: { intervalSec: 300 } },
      ]);

      await service.syncTimers();

      expect(scheduler.addInterval).toHaveBeenCalledWith(
        'heartbeat-interval-agent-1',
        expect.anything(),
      );
    });

    it('skips agents without schedule or interval', async () => {
      const { service, prisma, scheduler } = makeService();
      prisma.agentDefinition.findMany.mockResolvedValue([MOCK_AGENT]);

      await service.syncTimers();

      expect(scheduler.addCronJob).not.toHaveBeenCalled();
      expect(scheduler.addInterval).not.toHaveBeenCalled();
    });
  });
});
