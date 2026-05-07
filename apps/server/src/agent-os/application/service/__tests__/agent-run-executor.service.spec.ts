import { describe, expect, it, vi } from 'vitest';
import { AGENT_RUN_EVENTS } from '../../event/agent-run-events';
import { AgentRunExecutor } from '../agent-run-executor.service';
import type {
  AgentBlueprintRecord,
  AgentInstanceRecord,
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

function makeExecutor(options: {
  instance?: AgentInstanceRecord | null;
  blueprint?: AgentBlueprintRecord | null;
}) {
  const instance = Object.prototype.hasOwnProperty.call(options, 'instance')
    ? options.instance
    : makeInstance();
  const blueprint = Object.prototype.hasOwnProperty.call(options, 'blueprint')
    ? options.blueprint
    : makeBlueprint();
  const repository = {
    claimNextRunRequest: vi.fn().mockResolvedValue(makeClaimedRequest()),
    findInstanceById: vi.fn().mockResolvedValue(instance),
    findBlueprintByType: vi.fn().mockResolvedValue(blueprint),
    failClaimedRequest: vi.fn().mockResolvedValue(undefined),
    createRunForRequest: vi.fn(),
  };
  const runtime = { execute: vi.fn() };
  const eventEmitter = { emit: vi.fn() };
  const executor = new AgentRunExecutor(
    repository as never,
    runtime as never,
    eventEmitter as never,
  );

  return { executor, repository, eventEmitter };
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
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      AGENT_RUN_EVENTS.FINALIZED,
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        requestId: REQUEST_ID,
        status: 'failed',
        errorCode: testCase.errorCode,
      }),
    );
  });
});
