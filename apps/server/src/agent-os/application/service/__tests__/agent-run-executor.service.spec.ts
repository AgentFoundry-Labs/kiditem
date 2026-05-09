import { describe, expect, it, vi } from 'vitest';
import { AGENT_RUN_EVENTS } from '../../event/agent-run-events';
import { AgentRunExecutor } from '../agent-run-executor.service';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import type {
  AgentBlueprintRecord,
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
    agentType: 'rules_evaluator',
    adapterType: 'local',
    latestRunId: null,
    ...overrides,
  };
}

function makeInstance(overrides: Partial<AgentInstanceRecord> = {}): AgentInstanceRecord {
  return {
    id: INSTANCE_ID,
    organizationId: ORGANIZATION_ID,
    blueprintId: '55555555-5555-5555-5555-555555555555',
    type: 'rules_evaluator',
    name: 'Rules Evaluator',
    role: 'rules',
    title: null,
    icon: null,
    reportsToId: null,
    lifecycleStatus: 'active',
    pauseReason: null,
    trustLevel: 1,
    adapterType: 'local',
    modelOverride: null,
    adapterConfig: {},
    runtimeConfig: {},
    promptPathOverride: null,
    ...overrides,
  };
}

function makeBlueprint(
  overrides: Partial<AgentBlueprintRecord> = {},
): AgentBlueprintRecord {
  return {
    id: '55555555-5555-5555-5555-555555555555',
    type: 'rules_evaluator',
    name: 'Rules Evaluator',
    description: null,
    promptPath: 'agent-config/prompts/rules-evaluator.md',
    defaultAdapterType: 'local',
    defaultModel: 'gpt-5.4',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    catalogStatus: 'active',
    marketplaceId: null,
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
  blueprint?: AgentBlueprintRecord | null;
  claimed?: AgentRunRequestRecord | null;
  runtimeResult?: { output: Record<string, unknown> };
  runtimeError?: unknown;
}) {
  const instance = Object.prototype.hasOwnProperty.call(options, 'instance')
    ? options.instance
    : makeInstance();
  const blueprint = Object.prototype.hasOwnProperty.call(options, 'blueprint')
    ? options.blueprint
    : makeBlueprint();
  const claimed = Object.prototype.hasOwnProperty.call(options, 'claimed')
    ? options.claimed
    : makeClaimedRequest();
  const repository = {
    claimNextRunRequest: vi.fn().mockResolvedValue(claimed),
    findInstanceById: vi.fn().mockResolvedValue(instance),
    findBlueprintByType: vi.fn().mockResolvedValue(blueprint),
    failClaimedRequest: vi.fn().mockResolvedValue(undefined),
    createRunForRequest: vi.fn().mockResolvedValue(makeRun()),
    appendRunEvent: vi.fn().mockResolvedValue(undefined),
    finalizeRun: vi.fn().mockResolvedValue(makeRun()),
    markRequestStatus: vi.fn().mockResolvedValue(undefined),
  };
  const runtime = {
    execute: vi.fn().mockImplementation(async () => {
      if (options.runtimeError) throw options.runtimeError;
      return options.runtimeResult ?? { output: { ok: true } };
    }),
  };
  const eventEmitter = { emit: vi.fn() };
  const executor = new AgentRunExecutor(
    repository as never,
    runtime as never,
    eventEmitter as never,
  );

  return { executor, repository, runtime, eventEmitter };
}

describe('AgentRunExecutor', () => {
  it.each([
    {
      name: 'missing instance',
      options: { instance: null },
      errorCode: 'agent_instance_missing',
    },
    {
      name: 'missing blueprint',
      options: { blueprint: null },
      errorCode: 'blueprint_missing',
    },
    {
      name: 'missing effective model',
      options: { blueprint: makeBlueprint({ defaultModel: '' }) },
      errorCode: 'model_required',
    },
  ])('emits a terminal request event on pre-run failure: $name', async (testCase) => {
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
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      AGENT_RUN_EVENTS.FINALIZED,
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        requestId: REQUEST_ID,
        status: 'failed',
        errorCode: testCase.errorCode,
        agentType: 'rules_evaluator',
        source: 'rules',
        sourceResourceType: null,
        sourceResourceId: null,
        requestedByUserId: null,
      }),
    );
  });

  it('emits a succeeded FINALIZED event with the runtime output on success', async () => {
    const { executor, eventEmitter, repository } = makeExecutor({
      claimed: makeClaimedRequest({
        agentType: 'detail_page_generate',
        source: 'ai.detail_page_generate',
        sourceResourceType: 'content_generation',
        sourceResourceId: 'cg-42',
        requestedByUserId: 'user-77',
      }),
      runtimeResult: { output: { ok: true, sample: 'detail-page' } },
    });

    const result = await executor.executeNext('worker-1', ORGANIZATION_ID);
    expect(result).toMatchObject({ executed: true, requestId: REQUEST_ID });
    expect(repository.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'succeeded' }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      AGENT_RUN_EVENTS.FINALIZED,
      expect.objectContaining({
        status: 'succeeded',
        output: { ok: true, sample: 'detail-page' },
        agentType: 'detail_page_generate',
        source: 'ai.detail_page_generate',
        sourceResourceType: 'content_generation',
        sourceResourceId: 'cg-42',
        requestedByUserId: 'user-77',
      }),
    );
  });

  it('finalizes the run with runtime_not_configured when adapter throws', async () => {
    const { executor, repository, eventEmitter } = makeExecutor({
      claimed: makeClaimedRequest({
        attempts: 1,
        maxAttempts: 1,
        agentType: 'thumbnail_generate',
        source: 'ai.thumbnail_generate',
        sourceResourceType: 'thumbnail_generation',
        sourceResourceId: 'tg-77',
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
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      AGENT_RUN_EVENTS.FINALIZED,
      expect.objectContaining({
        status: 'failed',
        errorCode: 'runtime_not_configured',
        agentType: 'thumbnail_generate',
        source: 'ai.thumbnail_generate',
        sourceResourceType: 'thumbnail_generation',
        sourceResourceId: 'tg-77',
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

    expect(eventEmitter.emit).toHaveBeenCalledWith(
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
    const finalizedEmits = eventEmitter.emit.mock.calls.filter(
      ([eventName]: [string]) => eventName === AGENT_RUN_EVENTS.FINALIZED,
    );
    expect(finalizedEmits).toHaveLength(0);
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
