import { describe, it, expect, vi } from 'vitest';

// Mock adapter execution so executeHeartbeat runs deterministically.
// Must be declared before `HeartbeatService` import (vi.mock is hoisted).
let nextAdapterResult: any = null;
vi.mock('../../adapters/fallback-chain', () => ({
  executeFallbackChain: async function* () {
    return nextAdapterResult;
  },
}));

import { HeartbeatService } from '../heartbeat.service';

function makePrisma() {
  return {
    agentDefinition: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
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

function makeEventEmitter() {
  return {
    emit: vi.fn(),
  };
}

function makeFeatureGate() {
  return {
    isEnabled: vi.fn().mockResolvedValue(true),
  };
}

function makeService() {
  const prisma = makePrisma();
  const wakeup = makeWakeup();
  const skills = makeSkills();
  const scheduler = makeScheduler();
  const eventEmitter = makeEventEmitter();
  const featureGate = makeFeatureGate();
  return {
    service: new HeartbeatService(
      prisma as any, wakeup as any, skills as any, scheduler as any,
      eventEmitter as any, featureGate as any,
    ),
    prisma,
    wakeup,
    skills,
    scheduler,
    eventEmitter,
    featureGate,
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

  describe('secret scrub (Phase 0.2)', () => {
    // Stderr contains an OpenAI-style key + JWT. scrubSecrets should replace both
    // with [REDACTED] before persistence.
    const SECRET_STDERR = 'fatal: token=sk-abcdefghij1234567890xyz\n';

    function setupScrubRun() {
      const harness = makeService();
      const { prisma, wakeup } = harness;

      // agent lookup — called twice (once by executeHeartbeat, once for agentWithRt)
      prisma.agentDefinition.findUnique.mockResolvedValue({
        ...MOCK_AGENT,
        maxOutputTokens: 16000,
        rtConsecutiveFailCount: 0,
      });
      prisma.agentDefinition.update.mockResolvedValue({
        ...MOCK_AGENT,
        rtConsecutiveFailCount: 1,
        rtLastError: null,
      });

      wakeup.claimNext.mockResolvedValue({
        id: 'w-1',
        agentId: 'agent-1',
        companyId: 'c-1',
        source: 'on_demand',
        triggerDetail: null,
        payload: null,
      });

      prisma.heartbeatRun.create.mockResolvedValue({ id: 'run-1' });

      // adapter returns failing exit with secret-laden stderr
      nextAdapterResult = {
        exitCode: 1,
        signal: null,
        timedOut: false,
        stdout: '',
        stderr: SECRET_STDERR,
        usage: null,
        stopReason: null,
        sessionIdAfter: null,
      };

      return harness;
    }

    it('scrubs stderr secrets before saving to heartbeat_runs', async () => {
      const { service, prisma } = setupScrubRun();

      await (service as any).executeHeartbeat('agent-1');

      // heartbeat_runs.update — the persistence call that stores `error` + `stderrExcerpt`.
      // stderrExcerpt is written by TranscriptService (event handler, sync in this test),
      // so we only verify the critical-path write (error field).
      const updateCalls = prisma.heartbeatRun.update.mock.calls;
      const criticalCall = updateCalls.find(
        (c: any[]) => c[0]?.data?.error !== undefined && c[0]?.where?.id === 'run-1',
      );
      expect(criticalCall).toBeDefined();
      const criticalError = criticalCall![0].data.error as string;
      expect(criticalError).toContain('[REDACTED]');
      expect(criticalError).not.toContain('sk-abcdefghij1234567890xyz');
    });

    it('scrubs stderr secrets before saving rtLastError', async () => {
      const { service, prisma } = setupScrubRun();

      await (service as any).executeHeartbeat('agent-1');

      // agent_definitions.update with rtLastError — written after the run's update.
      const updateCalls = prisma.agentDefinition.update.mock.calls;
      const rtCall = updateCalls.find(
        (c: any[]) => c[0]?.data?.rtLastError !== undefined,
      );
      expect(rtCall).toBeDefined();
      const rtLastError = rtCall![0].data.rtLastError as string;
      expect(rtLastError).toContain('[REDACTED]');
      expect(rtLastError).not.toContain('sk-abcdefghij1234567890xyz');
    });
  });
});
