import { describe, expect, it, vi } from 'vitest';
import {
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  OrganizationIdSchema,
} from '@kiditem/shared/identifiers';
import { AgentSessionCancellationService } from '../agent-session-cancellation.service';

const ORGANIZATION_ID = 'org-1';
const SESSION_ID = '00000000-0000-4000-8000-000000000001';
const TASK_ID = '00000000-0000-4000-8000-000000000002';
const OPERATION_RUN_ID = '00000000-0000-4000-8000-000000000006';
const organization = OrganizationIdSchema.parse(ORGANIZATION_ID);
const session = formatAgentSessionName(organization, AgentSessionIdSchema.parse(SESSION_ID));
const task = formatAgentSessionTaskName(organization, AgentSessionIdSchema.parse(SESSION_ID), AgentSessionTaskIdSchema.parse(TASK_ID));

describe('AgentSessionCancellationService', () => {
  it('deduplicates concurrent explicit cancellation through one Operation and one runtime cancel', async () => {
    const runtime = { cancel: vi.fn().mockResolvedValue(undefined) };
    const controls = {
      loadCancelableTask: vi.fn().mockResolvedValue({
        organizationId: ORGANIZATION_ID,
        sessionId: SESSION_ID,
        taskId: TASK_ID,
        operationRunId: OPERATION_RUN_ID,
      }),
    };
    const operations = {
      cancel: vi.fn(async () => {
        await runtime.cancel();
        return { id: OPERATION_RUN_ID, status: 'cancelled' };
      }),
    };
    const service = new AgentSessionCancellationService(
      controls as never,
      operations as never,
    );
    const input = {
      organizationId: ORGANIZATION_ID,
      session,
      task,
      actorId: 'user-1',
      idempotencyKey: 'cancel:task-1',
      expectedStatus: 'running' as const,
      reason: 'operator_cancelled',
    };

    await Promise.all([service.cancel(input), service.cancel(input)]);
    expect(operations.cancel).toHaveBeenCalledOnce();
    expect(runtime.cancel).toHaveBeenCalledOnce();
    expect(controls.loadCancelableTask).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID, actorId: 'user-1',
      sessionId: SESSION_ID,
      taskId: TASK_ID,
      expectedStatus: 'running',
    });
  });

  it('does not let a concurrent actor bypass the task ownership check', async () => {
    let releaseOperation: ((value: { id: string; status: string }) => void) | undefined;
    const controls = {
      loadCancelableTask: vi.fn(({ actorId }: { actorId: string }) =>
        Promise.resolve(actorId === 'user-1'
          ? {
              organizationId: ORGANIZATION_ID,
              sessionId: SESSION_ID,
              taskId: TASK_ID,
              operationRunId: OPERATION_RUN_ID,
            }
          : null)),
    };
    const operations = {
      cancel: vi.fn(() => new Promise<{ id: string; status: string }>((resolve) => {
        releaseOperation = resolve;
      })),
    };
    const service = new AgentSessionCancellationService(
      controls as never,
      operations as never,
    );
    const input = {
      organizationId: ORGANIZATION_ID,
      session,
      task,
      actorId: 'user-1',
      idempotencyKey: 'cancel:owner',
      expectedStatus: 'running' as const,
      reason: null,
    };

    const ownerCancellation = service.cancel(input);
    const otherActorCancellation = service.cancel({
      ...input,
      actorId: 'user-2',
      idempotencyKey: 'cancel:other-user',
    });
    await Promise.resolve();
    releaseOperation?.({ id: OPERATION_RUN_ID, status: 'cancelled' });

    await expect(otherActorCancellation).rejects.toMatchObject({
      code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID',
    });
    await expect(ownerCancellation).resolves.toEqual({ status: 'cancelled' });
    expect(controls.loadCancelableTask).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'user-2',
    }));
  });

  it('does not turn reconnect or panel close into cancellation', async () => {
    const controls = { loadCancelableTask: vi.fn() };
    const operations = { cancel: vi.fn() };
    const service = new AgentSessionCancellationService(controls as never, operations as never);

    await expect(service.cancel({
      organizationId: 'other-org', session, task, actorId: 'user-1', reason: null,
      idempotencyKey: 'cancel:other-org', expectedStatus: 'running',
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID' });
    expect(operations.cancel).not.toHaveBeenCalled();
  });

  it('fails closed without enumerating a same-organization task owned by another actor', async () => {
    const controls = { loadCancelableTask: vi.fn().mockResolvedValue(null) };
    const operations = { cancel: vi.fn() };
    const service = new AgentSessionCancellationService(controls as never, operations as never);

    await expect(service.cancel({
      organizationId: ORGANIZATION_ID,
      session,
      task,
      actorId: 'foreign-user',
      idempotencyKey: 'cancel:foreign',
      expectedStatus: 'running',
      reason: null,
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID' });
    expect(operations.cancel).not.toHaveBeenCalled();
  });
});
