import { describe, expect, it, vi } from 'vitest';
import { AgentSessionDeletionOperationHandler } from '../agent-session-deletion.operation-handler';

describe('AgentSessionDeletionOperationHandler', () => {
  it('converts an unexpected execution exception to the safe retryable exhaustion path', async () => {
    const markDeleteFailed = vi.fn().mockResolvedValue(undefined);
    const handler = new AgentSessionDeletionOperationHandler(
      { execute: vi.fn().mockRejectedValue(new Error('provider_snapshot_error')) } as never,
      { markDeleteFailed } as never,
      { purgeGraphDeletedLineage: vi.fn() } as never,
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
    await handler.exhaustRetry(context as never, { code: 'SESSION_DELETION_INVARIANT' });
    expect(markDeleteFailed).toHaveBeenCalledOnce();
  });

  it('propagates the exact lifecycle abort reason instead of reclassifying it', async () => {
    const controller = new AbortController();
    const lifecycleReason = new Error('operation_server_shutdown');
    controller.abort(lifecycleReason);
    const handler = new AgentSessionDeletionOperationHandler(
      { execute: vi.fn().mockRejectedValue(new Error('provider_error_after_abort')) } as never,
      { markDeleteFailed: vi.fn() } as never,
      { purgeGraphDeletedLineage: vi.fn() } as never,
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
});
