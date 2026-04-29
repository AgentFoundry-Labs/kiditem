import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Panel emit hook tests for HeartbeatService (Task 17).
 *
 * Verify that PANEL_EVENTS.UPSERT is emitted at the right lifecycle points:
 *   1. On heartbeatRun.create (entering 'running')
 *   2. On terminal update (succeeded | failed)
 *
 * NOT emitted:
 *   - On non-status updates (transcript, result-cleanup)
 *   - When status is unchanged (no mid-run progress pings)
 */

// Mock adapter so executeHeartbeat runs deterministically.
// Must be declared before HeartbeatService import (vi.mock is hoisted).
let nextAdapterResult: any = null;
vi.mock('../../../automation/adapter/out/agent-runtime/fallback-chain', () => ({
  executeFallbackChain: async function* () {
    return nextAdapterResult;
  },
}));

import { HeartbeatService } from '../heartbeat.service';
import { PANEL_EVENTS } from '../../../automation/adapter/out/panel-event/panel-events';
import { AGENT_EVENTS } from '../../events/agent-events';

// ── helpers ────────────────────────────────────────────────────────────────

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
      updateMany: vi.fn(),
      findFirst: vi.fn(),
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
  return { emit: vi.fn() };
}

function makeFeatureGate() {
  return { isEnabled: vi.fn().mockResolvedValue(true) };
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
  maxOutputTokens: 16000,
  rtConsecutiveFailCount: 0,
};

const MOCK_WAKEUP = {
  id: 'w-1',
  agentId: 'agent-1',
  companyId: 'c-1',
  source: 'on_demand',
  triggerDetail: null,
  payload: null,
};

/** Stub run returned by heartbeatRun.create — status is 'running' */
function makeRunningRun(overrides?: Partial<any>) {
  return {
    id: 'run-1',
    agentId: 'agent-1',
    companyId: 'c-1',
    status: 'running',
    failureType: null,
    error: null,
    triggeredByUserId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Stub run returned by heartbeatRun.update — terminal status */
function makeTerminalRun(status: 'succeeded' | 'failed', overrides?: Partial<any>) {
  return {
    ...makeRunningRun(),
    status,
    finishedAt: new Date('2026-01-01T00:01:00Z'),
    failureType: status === 'failed' ? null : null,
    errorCode: status === 'failed' ? 'process_error' : null,
    error: status === 'failed' ? 'exit 1' : null,
    ...overrides,
  };
}

/** Minimal ok adapter result */
function successResult() {
  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    stdout: '',
    stderr: '',
    usage: null,
    stopReason: null,
    sessionIdAfter: null,
  };
}

function failResult() {
  return {
    exitCode: 1,
    signal: null,
    timedOut: false,
    stdout: '',
    stderr: 'exit 1',
    usage: null,
    stopReason: null,
    sessionIdAfter: null,
  };
}

// ── setup shared harness per test ──────────────────────────────────────────

function setupHarness(adapterResult: any) {
  const harness = makeService();
  const { prisma, wakeup } = harness;
  nextAdapterResult = adapterResult;

  prisma.agentDefinition.findUnique.mockResolvedValue(MOCK_AGENT);
  prisma.agentDefinition.update.mockResolvedValue({
    ...MOCK_AGENT,
    rtConsecutiveFailCount: adapterResult.exitCode === 0 ? 0 : 1,
  });

  wakeup.claimNext.mockResolvedValue(MOCK_WAKEUP);

  const runningRun = makeRunningRun();
  prisma.heartbeatRun.create.mockResolvedValue(runningRun);

  const terminalStatus = adapterResult.exitCode === 0 ? 'succeeded' : 'failed';
  const terminalRun = makeTerminalRun(terminalStatus);
  prisma.heartbeatRun.updateMany.mockResolvedValue({ count: 1 });
  prisma.heartbeatRun.findFirst.mockResolvedValue(terminalRun);

  wakeup.finish.mockResolvedValue(undefined);

  return { ...harness, runningRun, terminalRun };
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('HeartbeatService — Panel emit hook (Task 17)', () => {
  beforeEach(() => {
    nextAdapterResult = null;
  });

  it('emits PANEL_EVENTS.UPSERT on heartbeatRun.create (entering running)', async () => {
    const { service, eventEmitter, runningRun } = setupHarness(successResult());

    await (service as any).executeHeartbeat('agent-1');

    const panelCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    // At least one emit (create) before terminal
    expect(panelCalls.length).toBeGreaterThanOrEqual(1);

    // First panel emit: running run
    const createPayload = panelCalls[0][1];
    expect(createPayload).toMatchObject({
      companyId: 'c-1',
    });
    expect(createPayload.item).toBeDefined();
    expect(createPayload.item.status).toBe('running');
    expect(createPayload.item.source).toBe('agent');
    expect(createPayload.item.title).toBe(MOCK_AGENT.name);
    // companyId must NOT be on the item (envelope only)
    expect(createPayload.item.companyId).toBeUndefined();
  });

  it('emits PANEL_EVENTS.UPSERT on terminal transition (succeeded)', async () => {
    const { service, eventEmitter, terminalRun } = setupHarness(successResult());

    await (service as any).executeHeartbeat('agent-1');

    const panelCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    // Second panel emit: terminal
    expect(panelCalls.length).toBeGreaterThanOrEqual(2);
    const terminalPayload = panelCalls[1][1];
    expect(terminalPayload.item.status).toBe('succeeded');
    expect(terminalPayload.companyId).toBe('c-1');
    expect(terminalPayload.item.companyId).toBeUndefined();
  });

  it('emits PANEL_EVENTS.UPSERT on terminal transition (failed)', async () => {
    const { service, eventEmitter } = setupHarness(failResult());

    await (service as any).executeHeartbeat('agent-1');

    const panelCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    expect(panelCalls.length).toBeGreaterThanOrEqual(2);
    const terminalPayload = panelCalls[1][1];
    expect(terminalPayload.item.status).toBe('failed');
  });

  it('emits exactly 2 PANEL_EVENTS.UPSERT calls per lifecycle (create + terminal)', async () => {
    const { service, eventEmitter } = setupHarness(successResult());

    await (service as any).executeHeartbeat('agent-1');

    const panelCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    // Exactly 2: once on create, once on terminal
    expect(panelCalls).toHaveLength(2);
  });

  it('payload item has agent id/name surfaced (adapter join shape)', async () => {
    const { service, eventEmitter } = setupHarness(successResult());

    await (service as any).executeHeartbeat('agent-1');

    const panelCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    for (const call of panelCalls) {
      const item = call[1].item;
      expect(item.id).toBe(`agent:run-1`);
      expect(item.title).toBe(MOCK_AGENT.name);
      expect(item.deepLink).toContain(MOCK_AGENT.id);
      expect(item.deepLink).toContain('run-1');
    }
  });

  it('does not emit PANEL_EVENTS.UPSERT when wakeup claim returns null (no run)', async () => {
    const harness = makeService();
    harness.wakeup.claimNext.mockResolvedValue(null);
    harness.prisma.agentDefinition.findUnique.mockResolvedValue(MOCK_AGENT);

    await (harness.service as any).executeHeartbeat('agent-1');

    const panelCalls = (harness.eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === PANEL_EVENTS.UPSERT,
    );
    expect(panelCalls).toHaveLength(0);
  });

  it('AGENT_EVENTS.STATUS_CHANGED still emits alongside panel emit (no replacement)', async () => {
    const { service, eventEmitter } = setupHarness(successResult());

    await (service as any).executeHeartbeat('agent-1');

    const agentStatusCalls = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === AGENT_EVENTS.STATUS_CHANGED,
    );
    expect(agentStatusCalls.length).toBeGreaterThanOrEqual(1);
  });
});
