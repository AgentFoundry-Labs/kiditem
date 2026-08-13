import { describe, expect, it, vi } from 'vitest';
import { AgentSessionTaskOperationHandler } from '../agent-session-task.operation-handler';

const SESSION_ID = '00000000-0000-4000-8000-000000000001';
const TASK_ID = '00000000-0000-4000-8000-000000000002';
const EXECUTION_ID = '00000000-0000-4000-8000-000000000003';

const handle = {
  runtimeType: 'hermes_http', executionId: EXECUTION_ID, attemptId: 'attempt-1',
  externalRunId: 'external-1', encryptedHandleRef: 'vault://handle-1', generation: 1,
};
const runtimeHandleCheckpoint = {
  runtimeType: handle.runtimeType,
  executionId: handle.executionId,
  attemptId: handle.attemptId,
  externalRunId: handle.externalRunId,
  encryptedHandleRef: handle.encryptedHandleRef,
  generation: handle.generation,
};
const executionContext = {
  organizationId: 'org-1', sessionId: SESSION_ID, sessionTaskId: TASK_ID, executionId: EXECUTION_ID, attemptId: 'attempt-1',
  agentDefinitionKey: 'operator', agentVersionId: 'version-1', runtimeType: 'hermes_http', modelIdentity: 'gpt-test',
  capabilityKeys: [], policySnapshotId: 'policy-1', promptPackage: {}, conversationView: { throughSequence: '1', summary: null, turns: [] },
  currentInput: {}, currentResourceRefs: [],
};
const operation = {
  runId: 'operation-1', organizationId: 'org-1', operationKey: 'agent-os.execute-session-task', triggerSource: 'agent' as const,
  input: { sessionId: SESSION_ID, taskId: TASK_ID, executionId: EXECUTION_ID },
  requestedByUserId: null, scheduleId: null, parentRunId: null, attemptToken: 'attempt-token-1',
};

function harness(options: { checkpoint?: Record<string, unknown>; inspection?: Record<string, unknown> } = {}) {
  const order: string[] = [];
  const runtime = {
    runtimeType: 'hermes_http',
    capabilities: { detached: true, reconnect: true, interrupt: true, cancel: true, inspect: true },
    start: vi.fn(async () => { order.push('start'); return handle; }),
    connect: vi.fn(async function* () {
      order.push('connect');
      yield { kind: 'terminal', status: 'completed', output: { ok: true } } as const;
    }),
    inspect: vi.fn().mockResolvedValue(options.inspection ?? { status: 'running' }),
    interrupt: vi.fn(), cancel: vi.fn(),
  };
  const checkpoints = {
    findLatest: vi.fn().mockResolvedValue(options.checkpoint ?? null),
    append: vi.fn(async (input) => { order.push(`checkpoint:${input.kind}`); return { ...input, id: 'checkpoint', sequence: 1n, createdAt: new Date() }; }),
  };
  const controls = {
    startAttempt: vi.fn().mockResolvedValue({ id: 'attempt-1', executionId: 'execution-1', attemptNumber: 1, runtimeType: 'hermes_http', state: 'running' }),
    persistAttemptHandle: vi.fn(async () => { order.push('persist-handle'); return { id: 'attempt-1' }; }),
    finishAttempt: vi.fn().mockResolvedValue({ id: 'attempt-1' }),
    findTask: vi.fn().mockResolvedValue({ id: 'task-1', status: 'running' }),
    transitionTask: vi.fn().mockResolvedValue({ id: 'task-1', status: 'completed' }),
  };
  const executions = {
    loadExecutionRuntimeContext: vi.fn().mockResolvedValue({
      organizationId: 'org-1', sessionId: SESSION_ID, sessionTaskId: TASK_ID,
      executionId: EXECUTION_ID, runtimeType: 'hermes_http',
    }),
    findCurrentExecution: vi.fn().mockResolvedValue({ status: 'running' }),
    markExecutionTerminal: vi.fn(),
  };
  const operations = { heartbeatRun: vi.fn().mockResolvedValue(true) };
  const handler = new AgentSessionTaskOperationHandler(
    { register: vi.fn() } as never,
    { build: vi.fn().mockResolvedValue(executionContext) } as never,
    { requireCompatible: vi.fn().mockReturnValue(runtime) } as never,
    checkpoints as never,
    controls as never,
    executions as never,
    operations as never,
  );
  return { handler, runtime, checkpoints, controls, executions, order };
}

describe('AgentSessionTaskOperationHandler', () => {
  it('persists a new opaque handle before consuming runtime events', async () => {
    const { handler, runtime, order } = harness();
    await expect(handler.execute(operation)).resolves.toEqual({
      kind: 'completed',
      result: { executionId: EXECUTION_ID, taskId: TASK_ID, status: 'completed' },
    });
    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(order.indexOf('persist-handle')).toBeLessThan(order.indexOf('connect'));
    expect(order.indexOf('checkpoint:runtime_handle_persisted')).toBeLessThan(order.indexOf('connect'));
  });

  it('inspects, re-persists, and reconnects a checkpointed handle on lease reclaim without starting again', async () => {
    const { handler, runtime, controls, order } = harness({ checkpoint: {
      id: 'checkpoint-1', organizationId: 'org-1', operationRunId: 'operation-1', sequence: 3n,
      kind: 'runtime_handle_persisted', state: { runtimeHandle: runtimeHandleCheckpoint }, createdAt: new Date(),
    }});
    await handler.execute(operation);
    expect(runtime.inspect).toHaveBeenCalledWith(handle);
    expect(runtime.start).not.toHaveBeenCalled();
    expect(controls.persistAttemptHandle).toHaveBeenCalledWith(expect.objectContaining({
      executionId: EXECUTION_ID,
      externalRunId: 'external-1',
      encryptedHandleRef: 'vault://handle-1',
    }));
    expect(order.indexOf('persist-handle')).toBeLessThan(order.indexOf('connect'));
    expect(runtime.connect).toHaveBeenCalledWith(handle);
  });

  it('fails a lost persisted handle instead of starting a replacement', async () => {
    const { handler, runtime } = harness({
      checkpoint: { id: 'checkpoint-1', organizationId: 'org-1', operationRunId: 'operation-1', sequence: 3n, kind: 'runtime_handle_persisted', state: { runtimeHandle: runtimeHandleCheckpoint }, createdAt: new Date() },
      inspection: { status: 'unknown' },
    });
    await expect(handler.execute(operation)).resolves.toMatchObject({ kind: 'failed', code: 'AGENT_RUNTIME_HANDLE_LOST' });
    expect(runtime.start).not.toHaveBeenCalled();
  });

  it('checkpoints only an allowlisted encrypted handle reference and never adapter secrets', async () => {
    const { handler, checkpoints } = harness();
    await handler.execute(operation);

    const serialized = JSON.stringify(checkpoints.append.mock.calls);
    expect(serialized).toContain('encryptedHandleRef');
    expect(serialized).not.toContain('accessToken');
    expect(serialized).not.toContain('runtimeConfig');
    expect(serialized).not.toContain('promptPackage');
  });

  it('reconciles a terminal checkpoint after a worker crash without reopening the task or runtime', async () => {
    const { handler, runtime, controls } = harness({
      checkpoint: {
        id: 'checkpoint-terminal',
        organizationId: 'org-1',
        operationRunId: 'operation-1',
        sequence: 9n,
        kind: 'terminal',
        state: {
          runtimeHandle: runtimeHandleCheckpoint,
          status: 'completed',
          errorCode: null,
        },
        createdAt: new Date(),
      },
    });

    await expect(handler.execute(operation)).resolves.toEqual({
      kind: 'completed',
      result: { executionId: EXECUTION_ID, taskId: TASK_ID, status: 'completed' },
    });
    expect(controls.startAttempt).not.toHaveBeenCalled();
    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.inspect).not.toHaveBeenCalled();
  });
});
