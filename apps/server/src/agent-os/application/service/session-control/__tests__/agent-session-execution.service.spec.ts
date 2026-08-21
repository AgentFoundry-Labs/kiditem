import { describe, expect, it, vi } from 'vitest';
import {
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { AgentSessionExecutionService } from '../agent-session-execution.service';

const ORGANIZATION_ID = 'org-1';
const SESSION_ID = '00000000-0000-4000-8000-000000000001';
const TASK_ID = '00000000-0000-4000-8000-000000000002';
const EXECUTION_ID = '00000000-0000-4000-8000-000000000003';
const organization = OrganizationIdSchema.parse(ORGANIZATION_ID);
const session = formatAgentSessionName(
  organization,
  AgentSessionIdSchema.parse(SESSION_ID),
);
const task = formatAgentSessionTaskName(
  organization,
  AgentSessionIdSchema.parse(SESSION_ID),
  AgentSessionTaskIdSchema.parse(TASK_ID),
);

function record(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORGANIZATION_ID,
    sessionId: SESSION_ID,
    taskId: TASK_ID,
    taskStatus: 'failed',
    executionId: EXECUTION_ID,
    executionStatus: 'failed',
    runtimeType: 'hermes_http',
    requestedByUserId: 'user-1',
    operationRunId: null,
    ...overrides,
  };
}

function harness() {
  const controls = {
    loadTaskExecution: vi.fn().mockResolvedValue(record()),
    createRetryExecution: vi.fn().mockResolvedValue(record({
      taskStatus: 'queued', executionStatus: 'running',
    })),
  };
  const dispatch = {
    dispatch: vi.fn().mockResolvedValue({ operationsRunId: 'operation-1' }),
  };
  return {
    controls,
    dispatch,
    service: new AgentSessionExecutionService(
      controls as never,
      controls as never,
      dispatch as never,
    ),
  };
}

describe('AgentSessionExecutionService', () => {
  it('keeps inspection read-only and returns only canonical resource names', async () => {
    const { service, controls, dispatch } = harness();
    controls.loadTaskExecution.mockResolvedValue(record({ operationRunId: 'operation-inspect' }));

    const inspected = await service.inspect({
      organizationId: ORGANIZATION_ID,
      actorId: 'user-1',
      session,
      task,
    });
    expect(inspected).toMatchObject({
      session,
      task,
      execution: expect.stringContaining(`/executions/${EXECUTION_ID}`),
      executionStatus: 'failed',
      operation: `organizations/${ORGANIZATION_ID}/operations/operation-inspect`,
    });
    expect(inspected).not.toHaveProperty('operationRunId');
    expect(inspected).not.toHaveProperty('operationsRunId');
    expect(controls.createRetryExecution).not.toHaveBeenCalled();
    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });

  it('creates and dispatches one exact retry only from the allowed failed state', async () => {
    const { service, controls, dispatch } = harness();
    const retried = await service.retry({
      organizationId: ORGANIZATION_ID,
      actorId: 'user-1',
      session,
      task,
      expectedStatus: 'failed',
      idempotencyKey: 'retry:one',
    });
    expect(retried).toMatchObject({
      taskStatus: 'queued',
      executionStatus: 'running',
      operation: `organizations/${ORGANIZATION_ID}/operations/operation-1`,
    });
    expect(retried).not.toHaveProperty('operationRunId');
    expect(retried).not.toHaveProperty('operationsRunId');
    expect(controls.createRetryExecution).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      actorId: 'user-1',
      sessionId: SESSION_ID,
      taskId: TASK_ID,
      expectedStatus: 'failed',
      idempotencyKey: 'retry:one',
    });
    expect(dispatch.dispatch).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sessionId: SESSION_ID,
      taskId: TASK_ID,
      executionId: EXECUTION_ID,
      requestedByUserId: 'user-1',
    });

    expect(() => service.retry({
      organizationId: ORGANIZATION_ID,
      actorId: 'user-1',
      session,
      task,
      expectedStatus: 'paused',
      idempotencyKey: 'retry:forbidden',
    })).toThrow(expect.objectContaining({ code: 'AGENT_SESSION_CONTROL_STATE_CONFLICT' }));
  });
});
