import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeartbeatService } from '../heartbeat.service';
import { AGENT_EVENTS } from '../../events/agent-events';

// Mock getAdapter + getFallbackChain + validateAgentOutput + extractResultJsonFromStdout
vi.mock('../../adapters/registry', () => ({
  getAdapter: vi.fn(),
  getFallbackChain: vi.fn().mockReturnValue(['claude_local']),
}));

vi.mock('../../schemas/validate-output', () => ({
  validateAgentOutput: vi.fn().mockReturnValue({ valid: true, data: { actions: [] } }),
  extractResultJsonFromStdout: vi.fn().mockReturnValue({ actions: [] }),
}));

import { getAdapter } from '../../adapters/registry';
import { extractResultJsonFromStdout, validateAgentOutput } from '../../schemas/validate-output';

const MOCK_ADAPTER = {
  type: 'claude_local',
  execute: vi.fn(),
};

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
    agentTask: {
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
  requiresApproval: false,
  isActive: true,
  rtSessionId: null,
  rtConsecutiveFailCount: 0,
  rtLastFailedAt: null,
};

/** Wrap an ExecutionResult into an AsyncGenerator mock (adapter streaming interface) */
function mockAdapterGen(result: any) {
  return async function* () { return result; };
}

const MOCK_WAKEUP = {
  id: 'w-1',
  agentId: 'agent-1',
  companyId: 'c-1',
  source: 'on_demand',
  triggerDetail: null,
  payload: null,
};

const MOCK_RUN = {
  id: 'run-1',
  status: 'running',
};

const SUCCESS_RESULT = {
  exitCode: 0,
  signal: null,
  timedOut: false,
  stdout: JSON.stringify({ actions: [{ action: 'stop_ad', product_id: 'p1' }] }),
  stderr: '',
  sessionIdAfter: 'session-2',
  usage: { inputTokens: 100, outputTokens: 50, costCents: 10 },
};

const FAIL_RESULT = {
  exitCode: 1,
  signal: null,
  timedOut: false,
  stdout: '',
  stderr: 'Process exited with error',
  usage: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  (getAdapter as any).mockReturnValue(MOCK_ADAPTER);
});

describe('HeartbeatService — full execution lifecycle', () => {
  describe('wakeAgent checks', () => {
    it('returns ok:true and triggers execution for idle agent', async () => {
      const { service, prisma, wakeup } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue(MOCK_AGENT);
      wakeup.requestWakeup.mockResolvedValue({ id: 'w-1' });
      // Prevent actual async execution
      wakeup.claimNext.mockResolvedValue(null);

      const result = await service.wakeAgent({
        agentId: 'agent-1',
        companyId: 'c-1',
        source: 'on_demand',
        reason: 'Manual trigger',
      });

      expect(result.ok).toBe(true);
      expect(result).toMatchObject({ ok: true, queued: false, wakeupId: 'w-1' });
      expect(wakeup.requestWakeup).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-1', source: 'on_demand' }),
      );
    });

    it('returns ok:false when agent is paused', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue({ ...MOCK_AGENT, status: 'paused' });

      const result = await service.wakeAgent({ agentId: 'agent-1', source: 'on_demand' });

      expect(result).toEqual({ ok: false, error: 'agent_paused', agentId: 'agent-1' });
    });

    it('returns ok:false and emits budget warning when budget exceeded', async () => {
      const { service, prisma, eventEmitter } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue({
        ...MOCK_AGENT,
        monthlyTokenBudget: 1000,
        tokensUsed: 1200,
      });

      const result = await service.wakeAgent({ agentId: 'agent-1', source: 'on_demand' });

      expect(result).toEqual({ ok: false, error: 'budget_exceeded', agentId: 'agent-1' });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AGENT_EVENTS.BUDGET_WARNING,
        expect.objectContaining({ level: 'exceeded', companyId: 'c-1' }),
      );
    });

    it('returns ok:false when feature gate blocks execution', async () => {
      const { service, prisma, featureGate } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue(MOCK_AGENT);
      featureGate.isEnabled.mockResolvedValue(false);

      const result = await service.wakeAgent({ agentId: 'agent-1', source: 'on_demand' });

      expect(result).toEqual({ ok: false, error: 'feature_gate_blocked', agentId: 'agent-1' });
    });

    it('throws when agent not found', async () => {
      const { service, prisma } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue(null);

      await expect(
        service.wakeAgent({ agentId: 'missing-agent', source: 'on_demand' }),
      ).rejects.toThrow('not found');
    });
  });

  describe('full execution lifecycle via executeHeartbeat', () => {
    function setupSuccessfulExecution(prisma: ReturnType<typeof makePrisma>, wakeup: ReturnType<typeof makeWakeup>) {
      prisma.agentDefinition.findUnique.mockResolvedValue(MOCK_AGENT);
      prisma.agentDefinition.update.mockResolvedValue({
        ...MOCK_AGENT,
        rtConsecutiveFailCount: 0,
      });
      prisma.heartbeatRun.create.mockResolvedValue(MOCK_RUN);
      prisma.heartbeatRun.update.mockResolvedValue({});
      wakeup.requestWakeup.mockResolvedValue({ id: 'w-1' });
      wakeup.claimNext.mockResolvedValue(MOCK_WAKEUP);
      wakeup.finish.mockResolvedValue({});
      MOCK_ADAPTER.execute.mockImplementation(() => mockAdapterGen(SUCCESS_RESULT)());
      (extractResultJsonFromStdout as any).mockReturnValue({ actions: [] });
      (validateAgentOutput as any).mockReturnValue({ valid: true, data: { actions: [] } });
    }

    it('creates HeartbeatRun and updates status to running', async () => {
      const { service, prisma, wakeup, eventEmitter } = makeService();
      setupSuccessfulExecution(prisma, wakeup);

      await service.wakeAgent({ agentId: 'agent-1', source: 'on_demand' });

      // Wait for async execution to complete
      await new Promise((r) => setImmediate(r));

      expect(prisma.heartbeatRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'running',
            invocationSource: 'on_demand',
          }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AGENT_EVENTS.STATUS_CHANGED,
        expect.objectContaining({ status: 'running', companyId: 'c-1' }),
      );
    });

    it('on success: run status=succeeded, RESULT_READY event emitted', async () => {
      const { service, prisma, wakeup, eventEmitter } = makeService();
      setupSuccessfulExecution(prisma, wakeup);

      await service.wakeAgent({ agentId: 'agent-1', source: 'on_demand' });
      await new Promise((r) => setImmediate(r));

      expect(prisma.heartbeatRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'succeeded' }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AGENT_EVENTS.RESULT_READY,
        expect.objectContaining({ agentType: 'ad_strategy', companyId: 'c-1' }),
      );
      // Phase 0.3: status_changed 이벤트도 companyId 포함
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AGENT_EVENTS.STATUS_CHANGED,
        expect.objectContaining({ companyId: 'c-1' }),
      );
    });

    it('on success: consecutiveFailCount reset to 0, agent status set to idle', async () => {
      const { service, prisma, wakeup } = makeService();
      setupSuccessfulExecution(prisma, wakeup);
      // Simulate agent had previous failures
      prisma.agentDefinition.update
        .mockResolvedValueOnce({ ...MOCK_AGENT, status: 'running' }) // first update (status: running)
        .mockResolvedValueOnce({ ...MOCK_AGENT, rtConsecutiveFailCount: 0 }); // runtime state update

      await service.wakeAgent({ agentId: 'agent-1', source: 'on_demand' });
      await new Promise((r) => setImmediate(r));

      // Runtime update should set consecutiveFailCount: 0 on success
      expect(prisma.agentDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rtConsecutiveFailCount: 0 }),
        }),
      );
    });

    it('on failure: consecutiveFailCount incremented', async () => {
      const { service, prisma, wakeup } = makeService();
      prisma.agentDefinition.findUnique.mockResolvedValue({
        ...MOCK_AGENT,
        rtConsecutiveFailCount: 1,
      });
      prisma.agentDefinition.update.mockResolvedValue({
        ...MOCK_AGENT,
        rtConsecutiveFailCount: 2,
      });
      prisma.heartbeatRun.create.mockResolvedValue(MOCK_RUN);
      prisma.heartbeatRun.update.mockResolvedValue({});
      wakeup.requestWakeup.mockResolvedValue({ id: 'w-1' });
      wakeup.claimNext.mockResolvedValue(MOCK_WAKEUP);
      wakeup.finish.mockResolvedValue({});
      MOCK_ADAPTER.execute.mockImplementation(() => mockAdapterGen(FAIL_RESULT)());

      await service.wakeAgent({ agentId: 'agent-1', source: 'on_demand' });
      await new Promise((r) => setImmediate(r));

      expect(prisma.heartbeatRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'failed' }),
        }),
      );
      // rtConsecutiveFailCount should be incremented (prevCount + 1 = 2)
      expect(prisma.agentDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rtConsecutiveFailCount: 2 }),
        }),
      );
    });

    it('on 3 consecutive failures: agent auto-paused and AUTO_PAUSED event emitted', async () => {
      const { service, prisma, wakeup, eventEmitter } = makeService();
      // Agent has 2 previous failures; this is the 3rd
      prisma.agentDefinition.findUnique.mockResolvedValue({
        ...MOCK_AGENT,
        rtConsecutiveFailCount: 2,
      });
      prisma.agentDefinition.update
        .mockResolvedValueOnce({ ...MOCK_AGENT, status: 'running' }) // status: running update
        .mockResolvedValueOnce({ ...MOCK_AGENT, rtConsecutiveFailCount: 3 }); // runtime state → >= 3
      prisma.heartbeatRun.create.mockResolvedValue(MOCK_RUN);
      prisma.heartbeatRun.update.mockResolvedValue({});
      wakeup.requestWakeup.mockResolvedValue({ id: 'w-1' });
      wakeup.claimNext.mockResolvedValue(MOCK_WAKEUP);
      wakeup.finish.mockResolvedValue({});
      MOCK_ADAPTER.execute.mockImplementation(() => mockAdapterGen(FAIL_RESULT)());

      await service.wakeAgent({ agentId: 'agent-1', source: 'on_demand' });
      await new Promise((r) => setImmediate(r));

      // Should have paused agent
      expect(prisma.agentDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'paused',
            pauseReason: expect.stringContaining('consecutive_failures'),
          }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AGENT_EVENTS.AUTO_PAUSED,
        expect.objectContaining({ agentId: 'agent-1', companyId: 'c-1' }),
      );
    });

    it('wakeup finish called after run completes', async () => {
      const { service, prisma, wakeup } = makeService();
      setupSuccessfulExecution(prisma, wakeup);

      await service.wakeAgent({ agentId: 'agent-1', source: 'on_demand' });
      await new Promise((r) => setImmediate(r));

      expect(wakeup.finish).toHaveBeenCalledWith('w-1', 'run-1', undefined);
    });
  });
});
