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
    const cancellations = {
      begin: vi.fn().mockResolvedValue({
        kind: 'pending',
        operationRunId: OPERATION_RUN_ID,
      }),
      complete: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    };
    const operations = {
      cancel: vi.fn(async () => {
        await runtime.cancel();
        return { id: OPERATION_RUN_ID, status: 'cancelled' };
      }),
    };
    const service = new AgentSessionCancellationService(
      cancellations as never,
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
    expect(cancellations.begin).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      actorId: 'user-1',
      sessionId: SESSION_ID,
      taskId: TASK_ID,
      expectedStatus: 'running',
      idempotencyKey: 'cancel:task-1',
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it('does not let a concurrent actor bypass the task ownership check', async () => {
    let releaseOperation: ((value: { id: string; status: string }) => void) | undefined;
    const cancellations = {
      begin: vi.fn(({ actorId }: { actorId: string }) =>
        actorId === 'user-1'
          ? Promise.resolve({
              kind: 'pending' as const,
              operationRunId: OPERATION_RUN_ID,
            })
          : Promise.reject({ code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID' })),
      complete: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    };
    const operations = {
      cancel: vi.fn(() => new Promise<{ id: string; status: string }>((resolve) => {
        releaseOperation = resolve;
      })),
    };
    const service = new AgentSessionCancellationService(
      cancellations as never,
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
    expect(cancellations.begin).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'user-2',
    }));
  });

  it('does not turn reconnect or panel close into cancellation', async () => {
    const cancellations = { begin: vi.fn(), complete: vi.fn() };
    const operations = { cancel: vi.fn() };
    const service = new AgentSessionCancellationService(cancellations as never, operations as never);

    await expect(service.cancel({
      organizationId: 'other-org', session, task, actorId: 'user-1', reason: null,
      idempotencyKey: 'cancel:other-org', expectedStatus: 'running',
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID' });
    expect(operations.cancel).not.toHaveBeenCalled();
  });

  it('fails closed without enumerating a same-organization task owned by another actor', async () => {
    const cancellations = {
      begin: vi.fn().mockRejectedValue({
        code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID',
      }),
      complete: vi.fn(),
    };
    const operations = { cancel: vi.fn() };
    const service = new AgentSessionCancellationService(cancellations as never, operations as never);

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

  it('replays a durable completed result after service recreation without cancelling twice', async () => {
    const begin = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'pending', operationRunId: OPERATION_RUN_ID })
      .mockResolvedValueOnce({ kind: 'completed', status: 'cancelled' });
    const complete = vi.fn().mockResolvedValue({ status: 'cancelled' });
    const transaction = { begin, complete };
    const operations = {
      cancel: vi.fn().mockResolvedValue({
        id: OPERATION_RUN_ID,
        status: 'cancelled',
      }),
    };
    const input = {
      organizationId: ORGANIZATION_ID,
      session,
      task,
      actorId: 'user-1',
      idempotencyKey: 'cancel:durable',
      expectedStatus: 'running' as const,
      reason: 'operator_cancelled',
    };

    const first = new AgentSessionCancellationService(
      transaction as never,
      operations as never,
    );
    await expect(first.cancel(input)).resolves.toEqual({ status: 'cancelled' });

    const recreated = new AgentSessionCancellationService(
      transaction as never,
      operations as never,
    );
    await expect(recreated.cancel(input)).resolves.toEqual({ status: 'cancelled' });

    expect(operations.cancel).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'cancel:durable',
      operationRunId: OPERATION_RUN_ID,
      status: 'cancelled',
    }));
  });
});
