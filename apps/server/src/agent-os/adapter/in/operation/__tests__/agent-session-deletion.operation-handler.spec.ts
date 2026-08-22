import { describe, expect, it, vi } from 'vitest';
import { AgentSessionDeletionOperationHandler } from '../agent-session-deletion.operation-handler';
import { AGENT_SESSION_DELETE_OPERATION } from '../../../../domain/operation/agent-session-deletion.operations';

describe('AgentSessionDeletionOperationHandler', () => {
  it('delegates execution and terminal hooks to the deletion operation use case', async () => {
    const deletion = {
      execute: vi.fn().mockResolvedValue({ kind: 'retryable', code: 'SESSION_DELETION_INVARIANT', message: 'safe', retryAfterMs: 0 }),
      exhaustRetry: vi.fn().mockResolvedValue(undefined),
      finalizeEphemeralSuccess: vi.fn().mockResolvedValue(undefined),
    };
    const handler = new AgentSessionDeletionOperationHandler(
      deletion as never,
    );
    const context = {
      signal: new AbortController().signal,
      organizationId: '00000000-0000-4000-8000-000000000001',
      runId: '00000000-0000-4000-8000-000000000002',
      attemptToken: 'token-1',
      attempts: 5,
      maxAttempts: 5,
      enterEphemeralFinalization: vi.fn(),
      input: {
        session: 'organizations/00000000-0000-4000-8000-000000000001/agentSessions/00000000-0000-4000-8000-000000000003',
        retryGeneration: 1,
      },
    };

    await expect(handler.execute(context as never)).resolves.toMatchObject({
      kind: 'retryable',
      code: 'SESSION_DELETION_INVARIANT',
      retryAfterMs: 0,
    });
    await handler.exhaustRetry(context as never, {
      code: 'SESSION_DELETION_INVARIANT',
      message: 'safe',
    });
    await handler.finalizeEphemeralSuccess(context as never, { retained: false });
    expect(deletion.execute).toHaveBeenCalledWith(context);
    expect(deletion.exhaustRetry).toHaveBeenCalledWith(context, {
      code: 'SESSION_DELETION_INVARIANT',
      message: 'safe',
    });
    expect(deletion.finalizeEphemeralSuccess).toHaveBeenCalledWith(context, { retained: false });
  });

  it('does not classify lifecycle aborts itself', async () => {
    const controller = new AbortController();
    const lifecycleReason = new Error('operation_server_shutdown');
    controller.abort(lifecycleReason);
    const handler = new AgentSessionDeletionOperationHandler(
      {
        execute: vi.fn().mockRejectedValue(lifecycleReason),
        exhaustRetry: vi.fn(),
        finalizeEphemeralSuccess: vi.fn(),
      } as never,
    );

    await expect(handler.execute({
      signal: controller.signal,
      organizationId: '00000000-0000-4000-8000-000000000001',
      runId: '00000000-0000-4000-8000-000000000002',
      attemptToken: 'token-1', attempts: 1, maxAttempts: 5,
      enterEphemeralFinalization: vi.fn(),
      input: {
        session: 'organizations/00000000-0000-4000-8000-000000000001/agentSessions/00000000-0000-4000-8000-000000000003',
        retryGeneration: 1,
      },
    } as never)).rejects.toBe(lifecycleReason);
  });

  it('registers the deletion definition exactly once through the Operations registry', () => {
    const deletion = {
      execute: vi.fn(),
      exhaustRetry: vi.fn(),
      finalizeEphemeralSuccess: vi.fn(),
    };
    const registry = { register: vi.fn() };
    const handler = Reflect.construct(AgentSessionDeletionOperationHandler, [
      deletion,
      registry,
    ]) as { onModuleInit(): void };

    handler.onModuleInit();

    expect(registry.register).toHaveBeenCalledTimes(1);
    expect(registry.register).toHaveBeenCalledWith(
      AGENT_SESSION_DELETE_OPERATION,
      handler,
    );
  });
});
