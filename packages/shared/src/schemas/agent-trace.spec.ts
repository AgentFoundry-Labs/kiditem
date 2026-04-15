import { describe, it, expect } from 'vitest';
import {
  AgentTraceSchema,
  AgentTaskListResponseSchema,
} from './agent-trace.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    companyId: 'co-1',
    agentType: 'vision_strategist',
    status: 'completed',
    priority: 0,
    workflowRunId: 'wr-1',
    workflowNodeId: 'node-1',
    sourceDataId: null,
    input: { foo: 'bar' },
    output: { ok: true },
    error: null,
    scheduledAt: '2026-04-13T00:00:00.000Z',
    startedAt: '2026-04-13T00:00:10.000Z',
    completedAt: '2026-04-13T00:01:00.000Z',
    createdAt: '2026-04-13T00:00:00.000Z',
    updatedAt: '2026-04-13T00:01:00.000Z',
    ...overrides,
  };
}

function makeHeartbeat(id: string) {
  return {
    id,
    companyId: 'co-1',
    agentId: 'ag-1',
    invocationSource: 'on_demand',
    triggerDetail: null,
    status: 'succeeded',
    startedAt: '2026-04-13T00:00:10.000Z',
    finishedAt: '2026-04-13T00:00:50.000Z',
    error: null,
    exitCode: 0,
    signal: null,
    usageJson: null,
    resultJson: null,
    sessionIdBefore: null,
    sessionIdAfter: null,
    stdoutExcerpt: null,
    stderrExcerpt: null,
    errorCode: null,
    processPid: 1234,
    wakeupRequestId: null,
    createdAt: '2026-04-13T00:00:10.000Z',
    updatedAt: '2026-04-13T00:00:50.000Z',
  };
}

function makeEvent(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    companyId: 'co-1',
    agentId: 'ag-1',
    runId: 'hb-1',
    eventType: 'action_snapshot',
    category: null,
    detail: null,
    action: null,
    tableName: null,
    recordId: null,
    fieldName: null,
    valueBefore: null,
    valueAfter: null,
    restoredAt: null,
    createdAt: '2026-04-13T00:00:30.000Z',
    ...overrides,
  };
}

function makeLog(id: string) {
  return {
    id,
    taskId: 'task-1',
    level: 'info',
    message: 'processing',
    data: null,
    createdAt: '2026-04-13T00:00:20.000Z',
  };
}

function makeTrace(overrides: Record<string, unknown> = {}) {
  return {
    task: makeTask(),
    workflowRun: null,
    heartbeatRuns: [makeHeartbeat('hb-1'), makeHeartbeat('hb-2')],
    wakeupRequests: [],
    events: [
      makeEvent('ev-1'),
      makeEvent('ev-2'),
      makeEvent('ev-3'),
      makeEvent('ev-4'),
      makeEvent('ev-5'),
    ],
    logs: [makeLog('lg-1'), makeLog('lg-2'), makeLog('lg-3')],
    traceability: {
      markerFound: true,
      creationPath: 'workflow' as const,
      warning: null,
    },
    pagination: {
      hasMore: false,
      nextCursor: null,
    },
    ...overrides,
  };
}

// ─── AgentTraceSchema ────────────────────────────────────────────────────────

describe('AgentTraceSchema — happy path', () => {
  it('parses a valid trace fixture (heartbeatRuns 2, events 5, logs 3)', () => {
    const result = AgentTraceSchema.safeParse(makeTrace());
    expect(result.success).toBe(true);
  });

  it('accepts ISO string and Date object for date fields (zIsoDate)', () => {
    const withStrings = AgentTraceSchema.safeParse(makeTrace());
    expect(withStrings.success).toBe(true);

    const dateFixture = makeTrace({
      task: makeTask({
        createdAt: new Date('2026-04-13T00:00:00.000Z'),
        updatedAt: new Date('2026-04-13T00:01:00.000Z'),
        scheduledAt: new Date('2026-04-13T00:00:00.000Z'),
        startedAt: new Date('2026-04-13T00:00:10.000Z'),
        completedAt: new Date('2026-04-13T00:01:00.000Z'),
      }),
    });
    const withDates = AgentTraceSchema.safeParse(dateFixture);
    expect(withDates.success).toBe(true);
  });
});

describe('AgentTraceSchema — null allowances', () => {
  it('allows workflowRun = null', () => {
    const result = AgentTraceSchema.safeParse(makeTrace({ workflowRun: null }));
    expect(result.success).toBe(true);
  });

  it('allows traceability.warning = null', () => {
    const result = AgentTraceSchema.safeParse(
      makeTrace({
        traceability: { markerFound: false, creationPath: 'unknown', warning: null },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('allows pagination.nextCursor = null', () => {
    const result = AgentTraceSchema.safeParse(
      makeTrace({ pagination: { hasMore: false, nextCursor: null } }),
    );
    expect(result.success).toBe(true);
  });
});

describe('AgentTraceSchema — empty arrays', () => {
  it('accepts heartbeatRuns / events / logs all empty', () => {
    const result = AgentTraceSchema.safeParse(
      makeTrace({ heartbeatRuns: [], wakeupRequests: [], events: [], logs: [] }),
    );
    expect(result.success).toBe(true);
  });
});

describe('AgentTraceSchema — missing / invalid fields', () => {
  it('fails when task is missing', () => {
    const fixture = makeTrace();
    delete (fixture as Record<string, unknown>).task;
    const result = AgentTraceSchema.safeParse(fixture);
    expect(result.success).toBe(false);
  });

  it('fails when traceability.creationPath is not workflow|direct|unknown', () => {
    const result = AgentTraceSchema.safeParse(
      makeTrace({
        traceability: { markerFound: true, creationPath: 'bogus', warning: null },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('fails when pagination.hasMore is not a boolean', () => {
    const result = AgentTraceSchema.safeParse(
      makeTrace({ pagination: { hasMore: 'yes', nextCursor: null } }),
    );
    expect(result.success).toBe(false);
  });
});

describe('AgentTraceSchema — Json fields on events', () => {
  it('accepts snapshot-like Json values on valueBefore/valueAfter', () => {
    const result = AgentTraceSchema.safeParse(
      makeTrace({
        events: [
          makeEvent('ev-1', {
            valueBefore: { key: 'value' },
            valueAfter: { key: 'new-value' },
          }),
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts null for Json fields on events', () => {
    const result = AgentTraceSchema.safeParse(
      makeTrace({
        events: [
          makeEvent('ev-1', { valueBefore: null, valueAfter: null }),
        ],
      }),
    );
    expect(result.success).toBe(true);
  });
});

// ─── AgentTaskListResponseSchema ─────────────────────────────────────────────

describe('AgentTaskListResponseSchema', () => {
  it('accepts empty list with total=0, page=1, limit=20', () => {
    const result = AgentTaskListResponseSchema.safeParse({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    expect(result.success).toBe(true);
  });

  it('fails when page is 0 (must be positive)', () => {
    const result = AgentTaskListResponseSchema.safeParse({
      items: [],
      total: 0,
      page: 0,
      limit: 20,
    });
    expect(result.success).toBe(false);
  });

  it('fails when total is -1 (must be nonnegative)', () => {
    const result = AgentTaskListResponseSchema.safeParse({
      items: [],
      total: -1,
      page: 1,
      limit: 20,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a populated items array of AgentTask', () => {
    const result = AgentTaskListResponseSchema.safeParse({
      items: [makeTask(), makeTask({ id: 'task-2' })],
      total: 2,
      page: 1,
      limit: 20,
    });
    expect(result.success).toBe(true);
  });
});
