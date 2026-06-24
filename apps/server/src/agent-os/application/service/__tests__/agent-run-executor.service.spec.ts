import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_RUN_EVENTS } from '../../event/agent-run-events';
import { AgentRunExecutor } from '../agent-run-executor.service';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import type {
  AgentInstanceRecord,
  AgentRunRecord,
  AgentRunRequestRecord,
} from '../../../domain/agent-os.types';

const ORGANIZATION_ID = '11111111-1111-1111-1111-111111111111';
const REQUEST_ID = '22222222-2222-2222-2222-222222222222';
const INSTANCE_ID = '33333333-3333-3333-3333-333333333333';

function makeClaimedRequest(
  overrides: Partial<AgentRunRequestRecord> = {},
): AgentRunRequestRecord {
  return {
    id: REQUEST_ID,
    organizationId: ORGANIZATION_ID,
    agentInstanceId: INSTANCE_ID,
    taskSessionId: '44444444-4444-4444-4444-444444444444',
    source: 'rules',
    triggerDetail: null,
    reason: null,
    idempotencyKey: null,
    priority: 0,
    sourceWorkflowRunId: null,
    sourceWorkflowNodeId: null,
    sourceResourceType: null,
    sourceResourceId: null,
    requestedByUserId: null,
    requestedByActorType: null,
    requestedByActorId: null,
    payload: {},
    status: 'claimed',
    scheduledFor: new Date('2026-05-07T00:00:00.000Z'),
    claimedAt: new Date('2026-05-07T00:00:00.000Z'),
    claimedBy: 'worker-1',
    attempts: 1,
    maxAttempts: 1,
    finishedAt: null,
    coalescedIntoRequestId: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: new Date('2026-05-07T00:00:00.000Z'),
    updatedAt: new Date('2026-05-07T00:00:00.000Z'),
    taskKey: 'rules.evaluate',
    agentType: 'rules_evaluation',
    adapterType: 'claude_local',
    latestRunId: null,
    ...overrides,
  };
}

function makeInstance(overrides: Partial<AgentInstanceRecord> = {}): AgentInstanceRecord {
  return {
    id: INSTANCE_ID,
    organizationId: ORGANIZATION_ID,
    type: 'rules_evaluation',
    name: 'Rules Evaluation',
    role: 'rules',
    title: null,
    icon: null,
    reportsToId: null,
    lifecycleStatus: 'active',
    pauseReason: null,
    trustLevel: 1,
    adapterType: 'claude_local',
    modelOverride: null,
    adapterConfig: {},
    runtimeConfig: {},
    promptPathOverride: null,
    ...overrides,
  };
}

function makeRun(overrides: Partial<AgentRunRecord> = {}): AgentRunRecord {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    organizationId: ORGANIZATION_ID,
    agentInstanceId: INSTANCE_ID,
    requestId: REQUEST_ID,
    taskSessionId: '44444444-4444-4444-4444-444444444444',
    retryOfRunId: null,
    status: 'running',
    attempt: 1,
    invocationSource: 'rules',
    adapterType: 'local',
    model: 'gpt-5.4',
    provider: null,
    taskKey: 'rules.evaluate',
    startedAt: new Date('2026-05-07T00:00:00.000Z'),
    finishedAt: null,
    errorCode: null,
    errorMessage: null,
    output: null,
    lastEventSeq: 0,
    ...overrides,
  };
}

function makeExecutor(options: {
  instance?: AgentInstanceRecord | null;
  claimed?: AgentRunRequestRecord | null;
  runtimeResult?: { output: Record<string, unknown> };
  runtimeError?: unknown;
}) {
  const instance = Object.prototype.hasOwnProperty.call(options, 'instance')
    ? options.instance
    : makeInstance();
  const claimed = Object.prototype.hasOwnProperty.call(options, 'claimed')
    ? options.claimed
    : makeClaimedRequest();
  const repository = {
    claimNextRunRequest: vi.fn().mockResolvedValue(claimed),
    claimRunRequestById: vi.fn().mockResolvedValue(claimed),
    findInstanceById: vi.fn().mockResolvedValue(instance),
    failClaimedRequest: vi.fn().mockResolvedValue(undefined),
    createRunForRequest: vi.fn().mockResolvedValue(makeRun()),
    appendRunEvent: vi.fn().mockResolvedValue(undefined),
    finalizeRun: vi.fn().mockResolvedValue({
      run: makeRun(),
      requestStatus: 'succeeded',
    }),
    markRequestStatus: vi.fn().mockResolvedValue(undefined),
  };
  const runtime = {
    execute: vi.fn().mockImplementation(async () => {
      if (options.runtimeError) throw options.runtimeError;
      return options.runtimeResult ?? { output: { ok: true } };
    }),
  };
  const eventEmitter = {
    emit: vi.fn(),
    emitAsync: vi.fn().mockResolvedValue([]),
  };
  const executor = new AgentRunExecutor(
    repository as never,
    runtime as never,
    eventEmitter as never,
  );

  return { executor, repository, runtime, eventEmitter };
}

describe('AgentRunExecutor', () => {
  beforeEach(() => {
    vi.stubEnv('AGENT_DEFAULT_MODEL', 'gpt-5.4');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    {
      name: 'missing instance',
      options: { instance: null },
      errorCode: 'agent_instance_missing',
    },
    {
      name: 'missing code-owned definition',
      options: {
        instance: makeInstance({ type: 'unknown_agent' }),
        claimed: makeClaimedRequest({ agentType: 'unknown_agent' }),
      },
      errorCode: 'agent_definition_missing',
    },
    {
      name: 'missing effective model',
      options: {},
      errorCode: 'model_required',
      clearDefaultModel: true,
    },
  ])('emits a terminal request event on pre-run failure: $name', async (testCase) => {
    if ('clearDefaultModel' in testCase && testCase.clearDefaultModel) {
      vi.stubEnv('AGENT_DEFAULT_MODEL', '');
      vi.stubEnv('AGENT_RULES_EVALUATION_MODEL', '');
    }
    const { executor, repository, eventEmitter } = makeExecutor(testCase.options);

    const result = await executor.executeNext('worker-1', ORGANIZATION_ID);

    expect(result).toMatchObject({
      executed: false,
      requestId: REQUEST_ID,
      errorCode: testCase.errorCode,
    });
    expect(repository.failClaimedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        requestId: REQUEST_ID,
        errorCode: testCase.errorCode,
      }),
    );
    expect(repository.createRunForRequest).not.toHaveBeenCalled();
    // Pre-run failures must still carry routing metadata so AI bridges can
    // correlate runtime_not_configured-style failures with their domain row.
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      AGENT_RUN_EVENTS.FINALIZED,
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        requestId: REQUEST_ID,
        status: 'failed',
        errorCode: testCase.errorCode,
        agentType: testCase.options.claimed?.agentType ?? 'rules_evaluation',
        source: 'rules',
        sourceResourceType: null,
        sourceResourceId: null,
        requestedByUserId: null,
      }),
    );
  });

  it.each([
    {
      type: 'image_edit',
      adapterType: 'gemini_image',
      source: 'ai.image_edit',
    },
    {
      type: 'detail_page_generate',
      adapterType: 'gemini_text',
      source: 'ai.detail_page_generate',
    },
    {
      type: 'thumbnail_generate',
      adapterType: 'gemini_image',
      source: 'ai.thumbnail_generate',
    },
  ] as const)(
    'fails removed fixed AI job $type before runtime execution',
    async ({ type, adapterType, source }) => {
      const { executor, runtime, repository, eventEmitter } = makeExecutor({
        instance: makeInstance({
          type,
          adapterType,
        }),
        claimed: makeClaimedRequest({
          agentType: type,
          adapterType,
          source,
        }),
      });

      const result = await executor.executeNext('worker-1', ORGANIZATION_ID);

      expect(result).toMatchObject({
        executed: false,
        requestId: REQUEST_ID,
        errorCode: 'agent_definition_missing',
      });
      expect(repository.createRunForRequest).not.toHaveBeenCalled();
      expect(runtime.execute).not.toHaveBeenCalled();
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        AGENT_RUN_EVENTS.FINALIZED,
        expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          requestId: REQUEST_ID,
          agentType: type,
          source,
          status: 'failed',
          errorCode: 'agent_definition_missing',
        }),
      );
    },
  );

  it('emits a succeeded FINALIZED event with the runtime output on success', async () => {
    const { executor, eventEmitter, repository } = makeExecutor({
      claimed: makeClaimedRequest({
        agentType: 'rules_evaluation',
        source: 'rules.evaluation',
        sourceResourceType: 'rule_set',
        sourceResourceId: 'rules-42',
        requestedByUserId: 'user-77',
      }),
      runtimeResult: { output: { ok: true, sample: 'rules' } },
    });

    const result = await executor.executeNext('worker-1', ORGANIZATION_ID);
    expect(result).toMatchObject({
      executed: true,
      requestId: REQUEST_ID,
    });
    expect(repository.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'succeeded' }),
    );
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      AGENT_RUN_EVENTS.FINALIZED,
      expect.objectContaining({
        status: 'succeeded',
        output: { ok: true, sample: 'rules' },
        agentType: 'rules_evaluation',
        source: 'rules.evaluation',
        sourceResourceType: 'rule_set',
        sourceResourceId: 'rules-42',
        requestedByUserId: 'user-77',
      }),
    );
  });

  it('finalizes the run with runtime_not_configured when adapter throws', async () => {
    const { executor, repository, eventEmitter } = makeExecutor({
      instance: makeInstance({ type: 'rules_suggest' }),
      claimed: makeClaimedRequest({
        attempts: 1,
        maxAttempts: 1,
        agentType: 'rules_suggest',
        source: 'rules.suggest',
        sourceResourceType: 'rule_set',
        sourceResourceId: 'rules-77',
      }),
      runtimeError: new AgentOsRuntimeError(
        'runtime_not_configured',
        'no provider',
      ),
    });
    const result = await executor.executeNext('worker-1', ORGANIZATION_ID);

    expect(result).toMatchObject({
      executed: true,
      errorCode: 'runtime_not_configured',
    });
    expect(repository.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'runtime_not_configured',
      }),
    );
    // Failure path must surface routing metadata even though `output` is
    // absent — review #2: bridges cannot fall back on envelope sniffing.
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      AGENT_RUN_EVENTS.FINALIZED,
      expect.objectContaining({
        status: 'failed',
        errorCode: 'runtime_not_configured',
        agentType: 'rules_suggest',
        source: 'rules.suggest',
        sourceResourceType: 'rule_set',
        sourceResourceId: 'rules-77',
        requestedByUserId: null,
      }),
    );
  });

  it('threads requestedByUserId from the claimed request onto the failure event', async () => {
    const { executor, eventEmitter } = makeExecutor({
      claimed: makeClaimedRequest({
        attempts: 1,
        maxAttempts: 1,
        agentType: 'rules_evaluation',
        source: 'rules.evaluation',
        requestedByUserId: 'user-42',
      }),
      runtimeError: new AgentOsRuntimeError('boom', 'kapow'),
    });

    await executor.executeNext('worker-1', ORGANIZATION_ID);

    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      AGENT_RUN_EVENTS.FINALIZED,
      expect.objectContaining({
        status: 'failed',
        agentType: 'rules_evaluation',
        source: 'rules.evaluation',
        requestedByUserId: 'user-42',
      }),
    );
  });

  it('does NOT emit FINALIZED on retryable failure (request returns to pending)', async () => {
    const { executor, repository, eventEmitter } = makeExecutor({
      claimed: makeClaimedRequest({ attempts: 1, maxAttempts: 3 }),
      runtimeError: new AgentOsRuntimeError(
        'transient_error',
        'temporarily down',
      ),
    });
    await executor.executeNext('worker-1', ORGANIZATION_ID);

    expect(repository.markRequestStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    );
    const finalizedEmits = eventEmitter.emitAsync.mock.calls.filter(
      ([eventName]: [string]) => eventName === AGENT_RUN_EVENTS.FINALIZED,
    );
    expect(finalizedEmits).toHaveLength(0);
  });

  it('does not emit FINALIZED when a late runtime succeeds after cancellation', async () => {
    const { executor, repository, eventEmitter } = makeExecutor({
      claimed: makeClaimedRequest({ status: 'claimed' }),
      runtimeResult: { output: { ok: true } },
    });
    repository.finalizeRun.mockResolvedValueOnce({
      run: makeRun({ status: 'succeeded' }),
      requestStatus: 'cancelled',
    });

    await executor.executeNext('worker-1', ORGANIZATION_ID);

    expect(repository.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: REQUEST_ID, status: 'succeeded' }),
    );
    expect(eventEmitter.emitAsync).not.toHaveBeenCalledWith(
      AGENT_RUN_EVENTS.FINALIZED,
      expect.anything(),
    );
  });

  it('does not emit FINALIZED when a successful run leaves the request waiting for approval', async () => {
    const { executor, repository, eventEmitter } = makeExecutor({
      claimed: makeClaimedRequest({ status: 'claimed' }),
      runtimeResult: { output: { status: 'waiting_approval' } },
    });
    repository.finalizeRun.mockResolvedValueOnce({
      run: makeRun({ status: 'succeeded' }),
      requestStatus: 'requires_approval',
    });

    const result = await executor.executeNext('worker-1', ORGANIZATION_ID);

    expect(result).toMatchObject({
      executed: true,
      requestId: REQUEST_ID,
      reason: 'requires_approval',
    });
    expect(repository.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: REQUEST_ID, status: 'succeeded' }),
    );
    expect(eventEmitter.emitAsync).not.toHaveBeenCalledWith(
      AGENT_RUN_EVENTS.FINALIZED,
      expect.anything(),
    );
  });

  it('does not mark request failed or emit FINALIZED when a late runtime fails after cancellation', async () => {
    const { executor, repository, runtime, eventEmitter } = makeExecutor({
      claimed: makeClaimedRequest({ status: 'claimed', attempts: 3, maxAttempts: 3 }),
    });
    runtime.execute.mockRejectedValueOnce(new Error('provider timeout'));
    repository.finalizeRun.mockResolvedValueOnce({
      run: makeRun({ status: 'failed' }),
      requestStatus: 'cancelled',
    });

    await executor.executeNext('worker-1', ORGANIZATION_ID);

    expect(repository.markRequestStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
    expect(eventEmitter.emitAsync).not.toHaveBeenCalledWith(
      AGENT_RUN_EVENTS.FINALIZED,
      expect.anything(),
    );
  });

  it('waits for async finalized listeners before resolving a terminal success', async () => {
    let sinkApplied = false;
    const { executor, eventEmitter } = makeExecutor({
      claimed: makeClaimedRequest({
        agentType: 'rules_evaluation',
        source: 'rules.evaluation',
        sourceResourceType: 'rule_set',
        sourceResourceId: 'rules-inline',
      }),
    });
    eventEmitter.emitAsync.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      sinkApplied = true;
      return [];
    });

    const result = await executor.executeRequest(
      'agent-os-inline',
      ORGANIZATION_ID,
      REQUEST_ID,
    );

    expect(result).toMatchObject({ executed: true, requestId: REQUEST_ID });
    expect(sinkApplied).toBe(true);
  });

  describe('executeNextUnscoped', () => {
    it('claims without organizationId filter and runs the same path', async () => {
      const { executor, repository } = makeExecutor({});
      const result = await executor.executeNextUnscoped('worker-internal');

      expect(repository.claimNextRunRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          workerId: 'worker-internal',
          organizationId: null,
        }),
      );
      expect(result.executed).toBe(true);
    });

    it('returns no_pending_request when nothing to claim', async () => {
      const { executor, repository } = makeExecutor({ claimed: null });
      const result = await executor.executeNextUnscoped('worker-internal');
      expect(repository.claimNextRunRequest).toHaveBeenCalled();
      expect(result).toMatchObject({
        executed: false,
        reason: 'no_pending_request',
      });
    });
  });

  describe('executeRequest', () => {
    it('claims the requested row by id and runs the same execution path', async () => {
      const { executor, repository } = makeExecutor({});
      const result = await executor.executeRequest(
        'detail-page-inline',
        ORGANIZATION_ID,
        REQUEST_ID,
      );

      expect(repository.claimRunRequestById).toHaveBeenCalledWith(
        expect.objectContaining({
          workerId: 'detail-page-inline',
          organizationId: ORGANIZATION_ID,
          requestId: REQUEST_ID,
        }),
      );
      expect(repository.claimNextRunRequest).not.toHaveBeenCalled();
      expect(result.executed).toBe(true);
    });

    it('returns request_not_claimable when the requested row is already claimed or terminal', async () => {
      const { executor, repository } = makeExecutor({});
      repository.claimRunRequestById.mockResolvedValueOnce(null);

      const result = await executor.executeRequest(
        'detail-page-inline',
        ORGANIZATION_ID,
        REQUEST_ID,
      );

      expect(result).toMatchObject({
        executed: false,
        requestId: REQUEST_ID,
        reason: 'request_not_claimable',
      });
      expect(repository.findInstanceById).not.toHaveBeenCalled();
    });
  });

  describe('executeNext requires explicit organizationId', () => {
    it('returns organization_required when called with empty org', async () => {
      const { executor, repository } = makeExecutor({});
      const result = await executor.executeNext('worker-1', '');
      expect(result).toMatchObject({
        executed: false,
        reason: 'organization_required',
      });
      expect(repository.claimNextRunRequest).not.toHaveBeenCalled();
    });
  });
});
