import { describe, expect, it, vi } from 'vitest';
import { OperationDispatcherService } from '../operation-dispatcher.service';
import type { OperationRunRecord } from '../../port/out/repository/operation.repository.port';

const NOW = new Date('2026-08-13T01:02:03.000Z');

function run(overrides: Partial<OperationRunRecord> = {}): OperationRunRecord {
  return {
    id: 'c2e779aa-f5bf-42c2-91f2-dc10be211c71',
    organizationId: 'df3b198e-5b31-4f86-b054-bbf4852536a5',
    operationKey: 'sourcing.collect_daily_trends',
    definitionVersion: 1,
    ownerDomain: 'sourcing',
    title: 'Collect trends',
    engineType: 'composite',
    resourceClass: 'naver_api',
    executionTimeoutMs: 10_000,
    status: 'running',
    triggerSource: 'dashboard',
    requestedByUserId: null,
    parentRunId: null,
    scheduleId: null,
    idempotencyKey: null,
    input: {},
    result: null,
    progress: null,
    stage: null,
    stageUpdatedAt: null,
    progressCurrent: null,
    progressTotal: null,
    deadlineAt: new Date(NOW.getTime() + 10_000),
    nativeRunType: null,
    nativeRunId: null,
    attempts: 1,
    maxAttempts: 3,
    claimedBy: 'operations:test',
    attemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
    claimedAt: NOW,
    leaseExpiresAt: new Date(NOW.getTime() + 900),
    scheduledFor: null,
    errorCode: null,
    errorMessage: null,
    startedAt: NOW,
    finishedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    requestedBy: null,
    ...overrides,
  };
}

describe('OperationDispatcherService', () => {
  it('passes attempt controls to the handler and verifies the fence before completion', async () => {
    const execute = vi.fn().mockResolvedValue({
      kind: 'completed',
      result: { collected: 3 },
    });
    const repository = {
      transitionActiveAttempt: vi.fn().mockResolvedValue(run({ status: 'succeeded' })),
    };
    const dispatcher = new OperationDispatcherService(
      {
        getDefinition: vi.fn().mockReturnValue({ successPersistence: 'retained' }),
        getHandler: vi.fn().mockReturnValue({ execute }),
      } as never,
      repository as never,
      { waitForChild: vi.fn() } as never,
    );
    const controller = new AbortController();
    const checkpoint = vi.fn().mockResolvedValue(undefined);

    await dispatcher.dispatch(run(), {
      signal: controller.signal,
      checkpoint,
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      signal: controller.signal,
      checkpoint,
    }));
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(repository.transitionActiveAttempt).toHaveBeenCalledWith(expect.objectContaining({
      expectedAttemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
      status: 'succeeded',
    }));
  });

  it('does not commit handler completion after the attempt signal aborts', async () => {
    let resolveHandler!: (value: {
      kind: 'completed';
      result: Record<string, unknown>;
    }) => void;
    const handlerResult = new Promise<{
      kind: 'completed';
      result: Record<string, unknown>;
    }>((resolve) => {
      resolveHandler = resolve;
    });
    const repository = { transitionActiveAttempt: vi.fn() };
    const dispatcher = new OperationDispatcherService(
      {
        getDefinition: vi.fn().mockReturnValue({ successPersistence: 'retained' }),
        getHandler: vi.fn().mockReturnValue({
          execute: vi.fn().mockReturnValue(handlerResult),
        }),
      } as never,
      repository as never,
      { waitForChild: vi.fn() } as never,
    );
    const controller = new AbortController();

    const dispatch = dispatcher.dispatch(run(), {
      signal: controller.signal,
      checkpoint: vi.fn().mockResolvedValue(undefined),
    });
    controller.abort(new Error('operation_attempt_fence_lost'));
    resolveHandler({ kind: 'completed', result: { collected: 3 } });
    await dispatch;

    expect(repository.transitionActiveAttempt).not.toHaveBeenCalled();
  });

  it('rechecks the heartbeat fence before recording a handler failure', async () => {
    const repository = { transitionActiveAttempt: vi.fn() };
    const dispatcher = new OperationDispatcherService(
      {
        getDefinition: vi.fn().mockReturnValue({ successPersistence: 'retained' }),
        getHandler: vi.fn().mockReturnValue({
          execute: vi.fn().mockRejectedValue(new Error('provider failed')),
        }),
      } as never,
      repository as never,
      { waitForChild: vi.fn() } as never,
    );
    const controller = new AbortController();
    const checkpoint = vi.fn().mockImplementation(async () => {
      const reason = new Error('operation_attempt_fence_lost');
      controller.abort(reason);
      throw reason;
    });

    await dispatcher.dispatch(run(), {
      signal: controller.signal,
      checkpoint,
    });

    expect(checkpoint).toHaveBeenCalledOnce();
    expect(repository.transitionActiveAttempt).not.toHaveBeenCalled();
  });

  it.each([
    ['delegated', {
      kind: 'delegated',
      nativeRunType: 'agent_os',
      nativeRunId: 'native-1',
    }],
    ['waiting_runtime', { kind: 'waiting_runtime' }],
    ['attention_required', {
      kind: 'attention_required',
      reason: 'operator input required',
      result: { prompt: true },
    }],
    ['failed', {
      kind: 'failed',
      code: 'provider_failed',
      message: 'provider failed',
    }],
  ])('does not commit an aborted %s handler result', async (_kind, result) => {
    const handlerResult = deferredResult(result);
    const repository = { transitionActiveAttempt: vi.fn() };
    const dispatcher = new OperationDispatcherService(
      {
        getDefinition: vi.fn().mockReturnValue({ successPersistence: 'retained' }),
        getHandler: vi.fn().mockReturnValue({
          execute: vi.fn().mockReturnValue(handlerResult.promise),
        }),
      } as never,
      repository as never,
      { waitForChild: vi.fn() } as never,
    );
    const controller = new AbortController();
    const dispatch = dispatcher.dispatch(run(), {
      signal: controller.signal,
      checkpoint: vi.fn().mockResolvedValue(undefined),
    });

    controller.abort(new Error('operation_attempt_fence_lost'));
    handlerResult.resolve(result);
    await dispatch;

    expect(repository.transitionActiveAttempt).not.toHaveBeenCalled();
  });

  it('does not start waiting for a child after its attempt aborts', async () => {
    const result = {
      kind: 'waiting_dependency' as const,
      child: {
        operationKey: 'sourcing.child',
        input: {},
        idempotencyKey: 'child-1',
      },
    };
    const handlerResult = deferredResult(result);
    const compositeCoordinator = { waitForChild: vi.fn() };
    const dispatcher = new OperationDispatcherService(
      {
        getDefinition: vi.fn().mockReturnValue({ successPersistence: 'retained' }),
        getHandler: vi.fn().mockReturnValue({
          execute: vi.fn().mockReturnValue(handlerResult.promise),
        }),
      } as never,
      { transitionActiveAttempt: vi.fn() } as never,
      compositeCoordinator as never,
    );
    const controller = new AbortController();
    const dispatch = dispatcher.dispatch(run(), {
      signal: controller.signal,
      checkpoint: vi.fn().mockResolvedValue(undefined),
    });

    controller.abort(new Error('operation_attempt_fence_lost'));
    handlerResult.resolve(result);
    await dispatch;

    expect(compositeCoordinator.waitForChild).not.toHaveBeenCalled();
  });

  it('hands a bounded multi-child dependency result to the atomic coordinator', async () => {
    const children = [
      {
        operationKey: 'sourcing.collect_naver_trends',
        input: { source: 'naver' },
        idempotencyKey: `${run().id}:naver`,
      },
      {
        operationKey: 'sourcing.collect_1688_trends',
        input: { source: '1688' },
        idempotencyKey: `${run().id}:1688`,
      },
    ];
    const compositeCoordinator = {
      waitForChild: vi.fn(),
      waitForChildren: vi.fn().mockResolvedValue(undefined),
    };
    const dispatcher = new OperationDispatcherService(
      {
        getDefinition: vi.fn().mockReturnValue({ successPersistence: 'retained' }),
        getHandler: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue({
            kind: 'waiting_dependencies',
            children,
          }),
        }),
      } as never,
      { transitionActiveAttempt: vi.fn() } as never,
      compositeCoordinator as never,
    );

    await dispatcher.dispatch(run(), {
      signal: new AbortController().signal,
      checkpoint: vi.fn().mockResolvedValue(undefined),
    });

    expect(compositeCoordinator.waitForChildren).toHaveBeenCalledWith({
      parent: expect.objectContaining({ id: run().id }),
      children,
    });
    expect(compositeCoordinator.waitForChild).not.toHaveBeenCalled();
  });

  it('preserves normal retry semantics behind the active-attempt fence', async () => {
    const repository = {
      transitionActiveAttempt: vi.fn().mockResolvedValue(run({ status: 'queued' })),
    };
    const dispatcher = new OperationDispatcherService(
      {
        getDefinition: vi.fn().mockReturnValue({ successPersistence: 'retained' }),
        getHandler: vi.fn().mockReturnValue({
          execute: vi.fn().mockRejectedValue(new Error('provider failed')),
        }),
      } as never,
      repository as never,
      { waitForChild: vi.fn() } as never,
    );

    await dispatcher.dispatch(run({ attempts: 1, maxAttempts: 3 }), {
      signal: new AbortController().signal,
      checkpoint: vi.fn().mockResolvedValue(undefined),
    });

    expect(repository.transitionActiveAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedAttemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
        status: 'queued',
        errorCode: 'operation_execution_failed',
        finishedAt: null,
      }),
    );
  });

  it('requeues a retryable result at database time without terminal success', async () => {
    const execute = vi.fn().mockResolvedValue({
      kind: 'retryable',
      code: 'STORAGE_DELETE_UNKNOWN',
      message: 'Deletion storage state is unknown',
      retryAfterMs: 60_000,
    });
    const repository = {
      requeueActiveAttemptAfter: vi.fn().mockResolvedValue(run({ status: 'queued' })),
      transitionActiveAttempt: vi.fn(),
    };
    const dispatcher = new OperationDispatcherService(
      {
        getDefinition: vi.fn().mockReturnValue({ successPersistence: 'retained' }),
        getHandler: vi.fn().mockReturnValue({ execute }),
      } as never,
      repository as never,
      { waitForChild: vi.fn() } as never,
    );

    await dispatcher.dispatch(run({ attempts: 1, maxAttempts: 5 }), {
      signal: new AbortController().signal,
      checkpoint: vi.fn().mockResolvedValue(undefined),
      enterEphemeralFinalization: vi.fn(),
    } as never);

    expect(repository.requeueActiveAttemptAfter).toHaveBeenCalledWith({
      organizationId: 'df3b198e-5b31-4f86-b054-bbf4852536a5',
      runId: 'c2e779aa-f5bf-42c2-91f2-dc10be211c71',
      expectedAttemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
      delayMs: 60_000,
      errorCode: 'STORAGE_DELETE_UNKNOWN',
      errorMessage: 'Deletion storage state is unknown',
    });
    expect(repository.transitionActiveAttempt).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'succeeded' }),
    );
  });

  it('delegates an exhausted retryable result to the registered terminal handler', async () => {
    const exhaustRetry = vi.fn().mockResolvedValue(undefined);
    const repository = {
      requeueActiveAttemptAfter: vi.fn(),
      transitionActiveAttempt: vi.fn(),
    };
    const dispatcher = new OperationDispatcherService(
      {
        getDefinition: vi.fn().mockReturnValue({ successPersistence: 'retained' }),
        getHandler: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue({
            kind: 'retryable',
            code: 'STORAGE_DELETE_UNKNOWN',
            message: 'Deletion storage state is unknown',
            retryAfterMs: 60_000,
          }),
          exhaustRetry,
        }),
      } as never,
      repository as never,
      { waitForChild: vi.fn() } as never,
    );

    await dispatcher.dispatch(run({ attempts: 3, maxAttempts: 3 }), {
      signal: new AbortController().signal,
      checkpoint: vi.fn().mockResolvedValue(undefined),
      enterEphemeralFinalization: vi.fn(),
    } as never);

    expect(exhaustRetry).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 3, maxAttempts: 3 }),
      {
        code: 'STORAGE_DELETE_UNKNOWN',
        message: 'Deletion storage state is unknown',
      },
    );
    expect(repository.requeueActiveAttemptAfter).not.toHaveBeenCalled();
    expect(repository.transitionActiveAttempt).not.toHaveBeenCalled();
  });

  it('finalizes an ephemeral completion without persisting succeeded', async () => {
    const finalizeEphemeralSuccess = vi.fn().mockResolvedValue(undefined);
    const repository = { transitionActiveAttempt: vi.fn() };
    const dispatcher = new OperationDispatcherService(
      {
        getDefinition: vi.fn().mockReturnValue({
          successPersistence: 'ephemeral_on_success',
        }),
        getHandler: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue({
            kind: 'completed',
            result: { deleted: true },
          }),
          finalizeEphemeralSuccess,
        }),
      } as never,
      repository as never,
      { waitForChild: vi.fn() } as never,
    );
    const finalization = new AbortController();
    const enterEphemeralFinalization = vi.fn().mockResolvedValue({
      signal: finalization.signal,
    });

    await dispatcher.dispatch(run({ triggerSource: 'system' }), {
      signal: finalization.signal,
      checkpoint: vi.fn().mockResolvedValue(undefined),
      enterEphemeralFinalization,
    } as never);

    expect(enterEphemeralFinalization).toHaveBeenCalledOnce();
    expect(finalizeEphemeralSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1, maxAttempts: 3 }),
      { deleted: true },
    );
    expect(repository.transitionActiveAttempt).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'succeeded' }),
    );
  });

  it('checkpoints an ephemeral finalizer failure before retrying it', async () => {
    vi.useFakeTimers();
    try {
      const finalizeEphemeralSuccess = vi.fn()
        .mockRejectedValueOnce(new Error('purge unavailable'))
        .mockResolvedValueOnce(undefined);
      const checkpoint = vi.fn().mockResolvedValue(undefined);
      const dispatcher = new OperationDispatcherService(
        {
          getDefinition: vi.fn().mockReturnValue({
            successPersistence: 'ephemeral_on_success',
          }),
          getHandler: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue({
              kind: 'completed',
              result: { deleted: true },
            }),
            finalizeEphemeralSuccess,
          }),
        } as never,
        { transitionActiveAttempt: vi.fn() } as never,
        { waitForChild: vi.fn() } as never,
      );
      const dispatch = dispatcher.dispatch(run({ triggerSource: 'system' }), {
        signal: new AbortController().signal,
        checkpoint,
        enterEphemeralFinalization: vi.fn().mockResolvedValue({
          signal: new AbortController().signal,
        }),
      } as never);

      await vi.waitFor(() => expect(checkpoint).toHaveBeenCalledWith({
        stage: 'ephemeral_finalizing',
      }));
      await vi.advanceTimersByTimeAsync(250);
      await dispatch;

      expect(finalizeEphemeralSuccess).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

function deferredResult<T>(value: T) {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve, value };
}
