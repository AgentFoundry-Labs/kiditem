import { describe, expect, it, vi } from 'vitest';
import { continueOperationAttemptInTransaction } from '../continue-operation-attempt';

const input = {
  signal: new AbortController().signal,
  organizationId: 'org-1',
  sessionId: 'session-1',
  taskId: 'task-1',
  executionId: 'execution-1',
  attemptId: 'attempt-1',
  predecessorOperationRunId: 'run-predecessor',
  continuationKey: 'lifecycle:run-predecessor',
};

const immutablePredecessor = {
  id: 'run-predecessor',
  organizationId: input.organizationId,
  operationKey: 'agent-os.execute-session-task',
  definitionVersion: 1,
  ownerDomain: 'agent-os',
  title: 'Execute task',
  engineType: 'agent_os',
  resourceClass: 'default',
  executionTimeoutMs: 900_000,
  triggerSource: 'agent',
  requestedByUserId: 'user-1',
  parentRunId: null,
  scheduleId: null,
  idempotencyKey: 'initial-run',
  input: { execution: input.executionId },
  maxAttempts: 3,
  scheduledFor: null,
  status: 'cancelled',
  errorCode: 'operation_server_lifecycle_expired',
};

function transaction(overrides: {
  successorOwnership?: { organizationId: string; sessionId: string } | null;
  successorInput?: Record<string, unknown>;
} = {}) {
  const successor = {
    ...immutablePredecessor,
    id: 'run-successor',
    idempotencyKey: `agent-session-continuation:${input.attemptId}:${input.continuationKey}`,
    input: overrides.successorInput ?? immutablePredecessor.input,
    agentSessionOperationRunOwnership: overrides.successorOwnership === undefined
      ? { organizationId: input.organizationId, sessionId: input.sessionId }
      : overrides.successorOwnership,
  };
  const existing = {
    organizationId: input.organizationId,
    executionAttemptId: input.attemptId,
    executionId: input.executionId,
    sessionId: input.sessionId,
    operationRunId: successor.id,
    predecessorOperationRunId: input.predecessorOperationRunId,
    continuationKey: input.continuationKey,
    operationRun: successor,
    attempt: {
      id: input.attemptId,
      organizationId: input.organizationId,
      executionId: input.executionId,
      sessionId: input.sessionId,
      execution: { sessionTaskId: input.taskId },
    },
  };
  const predecessor = {
    operationRunId: immutablePredecessor.id,
    attempt: {
      id: input.attemptId,
      executionId: input.executionId,
      sessionId: input.sessionId,
      state: 'running',
      externalRunId: 'external-run',
      encryptedHandleRef: 'vault://handle',
      runtimeType: 'hermes_http',
      runtimeGeneration: 1,
      execution: {
        status: 'running',
        sessionTaskId: input.taskId,
        sessionTask: { status: 'running' },
      },
    },
    operationRun: immutablePredecessor,
  };
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([{
      id: input.sessionId,
      created_by_user_id: 'user-1',
      lifecycle: 'active',
      deletion_operation_run_id: null,
      deletion_failure_code: null,
    }]),
    agentExecutionAttemptOperationBinding: {
      findFirst: vi.fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(predecessor),
    },
    agentSessionOperationRunOwnership: {
      findFirst: vi.fn().mockResolvedValue({ sessionId: input.sessionId }),
    },
  };
}

describe('continueOperationAttemptInTransaction exact replay', () => {
  it.each([
    ['missing successor owner', { successorOwnership: null }],
    ['drifted successor input', { successorInput: { drifted: true } }],
  ] as const)('rejects %s', async (_scenario, overrides) => {
    await expect(continueOperationAttemptInTransaction(
      transaction(overrides) as never,
      input,
    )).rejects.toMatchObject({
      code: 'AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT',
    });
  });
});
