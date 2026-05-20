import { describe, expect, it, vi } from 'vitest';
import type {
  AgentRunRecord,
  AgentRunRequestRecord,
} from '../../../domain/agent-os.types';
import { AgentRunCoordinator } from '../agent-run-coordinator.service';

const ORG = '11111111-1111-1111-1111-111111111111';
const REQUEST_ID = '22222222-2222-2222-2222-222222222222';
const RUN_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '99999999-9999-9999-9999-999999999999';

function request(
  status: AgentRunRequestRecord['status'],
  id = REQUEST_ID,
): AgentRunRequestRecord {
  return {
    id,
    organizationId: ORG,
    agentInstanceId: 'instance-1',
    taskSessionId: 'session-1',
    source: 'rules.evaluation',
    triggerDetail: null,
    reason: null,
    idempotencyKey: null,
    priority: 0,
    sourceWorkflowRunId: null,
    sourceWorkflowNodeId: null,
    sourceResourceType: 'rule_set',
    sourceResourceId: 'rules-1',
    requestedByUserId: null,
    requestedByActorType: null,
    requestedByActorId: null,
    payload: {},
    status,
    scheduledFor: new Date('2026-05-17T00:00:00.000Z'),
    claimedAt: null,
    claimedBy: null,
    attempts: 0,
    maxAttempts: 3,
    finishedAt: null,
    coalescedIntoRequestId: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    taskKey: 'default',
    agentType: 'rules_evaluation',
    adapterType: 'claude_local',
    latestRunId: null,
  };
}

function run(status: AgentRunRecord['status']): AgentRunRecord {
  return {
    id: RUN_ID,
    organizationId: ORG,
    agentInstanceId: 'instance-1',
    requestId: REQUEST_ID,
    taskSessionId: 'session-1',
    retryOfRunId: null,
    status,
    attempt: 1,
    invocationSource: 'rules.evaluation',
    adapterType: 'claude_local',
    model: 'gemini-3',
    provider: null,
    taskKey: 'default',
    startedAt: new Date('2026-05-17T00:00:00.000Z'),
    finishedAt: null,
    errorCode: null,
    errorMessage: null,
    output: null,
    lastEventSeq: 0,
  };
}

function makeCoordinator(overrides: Record<string, unknown> = {}) {
  const repository = {
    findRunRequestById: vi.fn(),
    findRunById: vi.fn(),
    findRunByRequestId: vi.fn(),
    listRunRequests: vi.fn(),
    markRequestStatus: vi.fn().mockResolvedValue(request('cancelled')),
    markRequestStatusIfCurrent: vi.fn().mockResolvedValue(request('cancelled')),
    appendRunEvent: vi.fn().mockResolvedValue({}),
    finalizeRun: vi.fn().mockResolvedValue({ run: run('cancelled'), requestStatus: 'cancelled' }),
    ...overrides,
  };
  return {
    repository,
    coordinator: new AgentRunCoordinator(repository as never),
  };
}

describe('AgentRunCoordinator cancellation', () => {
  it('cancels a pending request by id', async () => {
    const { coordinator, repository } = makeCoordinator({
      findRunRequestById: vi.fn().mockResolvedValue(request('pending')),
    });

    const result = await coordinator.cancelRequest({
      organizationId: ORG,
      requestId: REQUEST_ID,
      reason: '사용자 요청',
      actorUserId: USER_ID,
    });

    expect(repository.markRequestStatusIfCurrent).toHaveBeenCalledWith({
      organizationId: ORG,
      requestId: REQUEST_ID,
      currentStatuses: ['pending', 'claimed', 'requires_approval'],
      status: 'cancelled',
      errorCode: 'user_cancelled',
      errorMessage: '사용자 요청',
      payload: {
        operationCancellation: expect.objectContaining({
          requestedByUserId: USER_ID,
          reason: '사용자 요청',
          result: 'cancelled',
          target: { targetType: 'agent_run_request', requestId: REQUEST_ID },
          affected: expect.objectContaining({
            agentRunRequestIds: [REQUEST_ID],
          }),
        }),
      },
    });
    expect(result).toMatchObject({ ok: true, cancelledRequests: 1 });
  });

  it('does not overwrite a request that becomes terminal during cancellation', async () => {
    const { coordinator, repository } = makeCoordinator({
      findRunRequestById: vi.fn().mockResolvedValue(request('claimed')),
      markRequestStatusIfCurrent: vi.fn().mockResolvedValue(null),
    });

    const result = await coordinator.cancelRequest({
      organizationId: ORG,
      requestId: REQUEST_ID,
      reason: '사용자 요청',
    });

    expect(repository.markRequestStatusIfCurrent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: REQUEST_ID,
        currentStatuses: ['pending', 'claimed', 'requires_approval'],
      }),
    );
    expect(repository.appendRunEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      cancelledRequests: 0,
      skippedRequests: 1,
    });
  });

  it('does not mutate a terminal request by id', async () => {
    const { coordinator, repository } = makeCoordinator({
      findRunRequestById: vi.fn().mockResolvedValue(request('succeeded')),
    });

    const result = await coordinator.cancelRequest({
      organizationId: ORG,
      requestId: REQUEST_ID,
      reason: '사용자 요청',
    });

    expect(repository.markRequestStatus).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      cancelledRequests: 0,
      skippedRequests: 1,
    });
  });

  it('records cancel request on a running run and cancels its request ledger', async () => {
    const { coordinator, repository } = makeCoordinator({
      findRunById: vi.fn().mockResolvedValue(run('running')),
      findRunRequestById: vi.fn().mockResolvedValue(request('claimed')),
    });

    const result = await coordinator.cancelRun({
      organizationId: ORG,
      runId: RUN_ID,
      reason: '사용자 요청',
      actorUserId: USER_ID,
    });

    expect(repository.appendRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        runId: RUN_ID,
        type: 'run.cancel_requested',
        message: '사용자 요청',
        data: expect.objectContaining({
          operationCancellation: expect.objectContaining({
            requestedByUserId: USER_ID,
            target: { targetType: 'agent_run', runId: RUN_ID },
          }),
        }),
      }),
    );
    expect(repository.markRequestStatusIfCurrent).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: REQUEST_ID, status: 'cancelled' }),
    );
    expect(repository.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        runId: RUN_ID,
        requestId: REQUEST_ID,
        status: 'cancelled',
        errorCode: 'user_cancelled',
      }),
    );
    expect(result.cancelledRuns).toBe(1);
  });

  it('cancels non-terminal requests by workflow run id', async () => {
    const { coordinator, repository } = makeCoordinator({
      listRunRequests: vi.fn().mockResolvedValue([
        request('pending'),
        request('claimed', '44444444-4444-4444-4444-444444444444'),
      ]),
      findRunRequestById: vi.fn()
        .mockResolvedValueOnce(request('pending'))
        .mockResolvedValueOnce(request('claimed', '44444444-4444-4444-4444-444444444444')),
    });

    const result = await coordinator.cancelByWorkflowRun({
      organizationId: ORG,
      workflowRunId: '55555555-5555-5555-5555-555555555555',
      reason: '워크플로우 중단',
    });

    expect(repository.listRunRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        sourceWorkflowRunId: '55555555-5555-5555-5555-555555555555',
        status: ['pending', 'claimed', 'requires_approval'],
      }),
    );
    expect(repository.markRequestStatusIfCurrent).toHaveBeenCalledTimes(2);
    expect(result.cancelledRequests).toBe(2);
  });
});

describe('AgentRunCoordinator runByType', () => {
  it('rejects agent types that are no longer registered in the code-owned definition registry', async () => {
    const { coordinator, repository } = makeCoordinator({
      findActiveInstanceByType: vi.fn(),
    });

    const result = await coordinator.runByType('thumbnail_auto_edit', {
      organizationId: ORG,
      sourceType: 'manual',
    });

    expect(result).toEqual({
      ok: false,
      agentType: 'thumbnail_auto_edit',
      reason: 'agent_definition_not_found',
    });
    expect(repository.findActiveInstanceByType).not.toHaveBeenCalled();
  });
});
