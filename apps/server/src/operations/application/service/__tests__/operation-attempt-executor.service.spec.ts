import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationRunRecord } from '../../port/out/repository/operation.repository.port';
import { OperationAttemptExecutorService } from '../operation-attempt-executor.service';
import { OperationDispatcherService } from '../operation-dispatcher.service';

const NOW = new Date('2026-08-13T01:02:03.000Z');
const originalLeaseMs = process.env.OPERATION_RUN_LEASE_MS;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.OPERATION_RUN_LEASE_MS = '900';
});

afterEach(() => {
  vi.useRealTimers();
  if (originalLeaseMs === undefined) delete process.env.OPERATION_RUN_LEASE_MS;
  else process.env.OPERATION_RUN_LEASE_MS = originalLeaseMs;
});

describe('OperationAttemptExecutorService', () => {
  it('keeps graph commit and retried ephemeral purge alive past the ordinary deadline', async () => {
    const graphCommit = deferred<void>();
    const repository = {
      heartbeatRun: vi.fn().mockResolvedValue(run()),
      transition: vi.fn(),
      transitionActiveAttempt: vi.fn(),
    };
    let finalizationSignal: AbortSignal | undefined;
    const finalizeEphemeralSuccess = vi.fn()
      .mockRejectedValueOnce(new Error('purge unavailable'))
      .mockResolvedValueOnce(undefined);
    const registry = {
      getDefinition: vi.fn().mockReturnValue({
        successPersistence: 'ephemeral_on_success',
      }),
      getHandler: vi.fn().mockReturnValue({
        execute: vi.fn(async (context: {
          enterEphemeralFinalization(): Promise<{ signal: AbortSignal }>;
        }) => {
          const first = await context.enterEphemeralFinalization();
          const second = await context.enterEphemeralFinalization();
          finalizationSignal = first.signal;
          expect(second.signal).toBe(first.signal);
          await graphCommit.promise;
          return { kind: 'completed', result: { deleted: true } };
        }),
        finalizeEphemeralSuccess,
      }),
    };
    const dispatcher = new OperationDispatcherService(
      registry as never,
      repository as never,
      { waitForChild: vi.fn() } as never,
    );
    const executor = new OperationAttemptExecutorService(
      dispatcher,
      repository as never,
      registry as never,
    );

    const execution = executor.execute(run({
      operationKey: 'agent-os.delete-session',
      triggerSource: 'system',
      executionTimeoutMs: 900_000,
      deadlineAt: new Date(NOW.getTime() + 900_000),
    }));

    await vi.waitFor(() => expect(finalizationSignal).toBeDefined());
    await vi.advanceTimersByTimeAsync(900_000);
    expect(finalizationSignal?.aborted).toBe(false);
    graphCommit.resolve();
    await vi.waitFor(() => expect(finalizeEphemeralSuccess).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(250);
    await execution;

    expect(finalizeEphemeralSuccess).toHaveBeenCalledTimes(2);
    expect(repository.heartbeatRun).toHaveBeenCalled();
    expect(repository.transition).not.toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'operation_deadline_exceeded' }),
    );
  });

  it('rejects retained operations that request ephemeral finalization', async () => {
    const dispatcher = {
      dispatch: vi.fn(async (_run, controls: {
        enterEphemeralFinalization(): Promise<{ signal: AbortSignal }>;
      }) => controls.enterEphemeralFinalization()),
    };
    const Executor = OperationAttemptExecutorService as unknown as new (
      dispatcher: unknown,
      repository: unknown,
      registry: unknown,
    ) => OperationAttemptExecutorService;
    const executor = new Executor(dispatcher, {
      heartbeatRun: vi.fn(),
      transition: vi.fn(),
    }, {
      getDefinition: vi.fn().mockReturnValue({ successPersistence: 'retained' }),
    });

    await expect(executor.execute(run())).rejects.toThrow(
      'operation_ephemeral_finalization_not_allowed',
    );
  });

  it('renews the attempt lease every lease third while dispatch is active', async () => {
    const dispatch = deferred<void>();
    const repository = {
      heartbeatRun: vi.fn().mockResolvedValue(run()),
      transition: vi.fn(),
    };
    const executor = new OperationAttemptExecutorService(
      { dispatch: vi.fn().mockReturnValue(dispatch.promise) } as never,
      repository as never,
    );

    const execution = executor.execute(run());
    await vi.advanceTimersByTimeAsync(300);

    expect(repository.heartbeatRun).toHaveBeenCalledWith({
      organizationId: 'df3b198e-5b31-4f86-b054-bbf4852536a5',
      runId: 'c2e779aa-f5bf-42c2-91f2-dc10be211c71',
      attemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
      now: new Date(NOW.getTime() + 300),
      leaseExpiresAt: new Date(NOW.getTime() + 1_200),
    });

    dispatch.resolve();
    await execution;
  });

  it('aborts the dispatch signal when a heartbeat loses the attempt fence', async () => {
    let observedSignal: AbortSignal | undefined;
    const repository = {
      heartbeatRun: vi.fn().mockResolvedValue(null),
      transition: vi.fn(),
    };
    const dispatcher = {
      dispatch: vi.fn((_run, controls: { signal: AbortSignal }) => {
        observedSignal = controls.signal;
        return new Promise<void>((resolve) => {
          controls.signal.addEventListener('abort', () => resolve(), { once: true });
        });
      }),
    };
    const executor = new OperationAttemptExecutorService(
      dispatcher as never,
      repository as never,
    );

    const execution = executor.execute(run());
    await vi.advanceTimersByTimeAsync(300);
    await execution;

    expect(observedSignal?.aborted).toBe(true);
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('sends checkpoint stage and paired counts through the heartbeat fence', async () => {
    const repository = {
      heartbeatRun: vi.fn().mockResolvedValue(run()),
      transition: vi.fn(),
    };
    const dispatcher = {
      dispatch: vi.fn(async (_run, controls: {
        checkpoint(update: {
          stage: string;
          progressCurrent: number;
          progressTotal: number;
        }): Promise<void>;
      }) => {
        await controls.checkpoint({
          stage: 'collecting_keyword',
          progressCurrent: 3,
          progressTotal: 12,
        });
      }),
    };
    const executor = new OperationAttemptExecutorService(
      dispatcher as never,
      repository as never,
    );

    await executor.execute(run());

    expect(repository.heartbeatRun).toHaveBeenCalledWith(expect.objectContaining({
      attemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
      stage: 'collecting_keyword',
      progressCurrent: 3,
      progressTotal: 12,
    }));
  });

  it('fails the exact attempt when its absolute deadline aborts dispatch', async () => {
    const repository = {
      heartbeatRun: vi.fn().mockResolvedValue(run()),
      transition: vi.fn().mockResolvedValue(run({ status: 'failed' })),
    };
    const dispatcher = {
      dispatch: vi.fn((_run, controls: { signal: AbortSignal }) =>
        new Promise<void>((resolve) => {
          controls.signal.addEventListener('abort', () => resolve(), { once: true });
        })),
    };
    const executor = new OperationAttemptExecutorService(
      dispatcher as never,
      repository as never,
    );

    const execution = executor.execute(run({
      deadlineAt: new Date(NOW.getTime() + 1_000),
    }));
    await vi.advanceTimersByTimeAsync(1_000);
    await execution;

    expect(repository.transition).toHaveBeenCalledWith({
      organizationId: 'df3b198e-5b31-4f86-b054-bbf4852536a5',
      runId: 'c2e779aa-f5bf-42c2-91f2-dc10be211c71',
      expectedStatuses: ['running'],
      expectedAttemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
      status: 'failed',
      errorCode: 'operation_deadline_exceeded',
      errorMessage: 'Operation execution deadline exceeded',
      finishedAt: new Date(NOW.getTime() + 1_000),
      claimedBy: null,
      attemptToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
    });
  });

  it('cleans heartbeat and deadline timers after a normal dispatch', async () => {
    const executor = new OperationAttemptExecutorService(
      { dispatch: vi.fn().mockResolvedValue(undefined) } as never,
      {
        heartbeatRun: vi.fn(),
        transition: vi.fn(),
      } as never,
    );

    await executor.execute(run());

    expect(vi.getTimerCount()).toBe(0);
  });

  it('terminal-cancels the exact active attempt after worker shutdown aborts dispatch', async () => {
    let observedSignal: AbortSignal | undefined;
    const repository = {
      heartbeatRun: vi.fn(),
      transition: vi.fn(),
      cancelClaimedAttemptForLifecycle: vi.fn().mockResolvedValue(true),
    };
    const executor = new OperationAttemptExecutorService(
      {
        dispatch: vi.fn((_run, controls: { signal: AbortSignal }) => {
          observedSignal = controls.signal;
          return new Promise<void>((resolve) => {
            controls.signal.addEventListener('abort', () => resolve(), { once: true });
          });
        }),
      } as never,
      repository as never,
    );

    const execution = executor.execute(run());
    executor.abortAll(new Error('operation_server_shutdown'));
    await execution;

    expect(observedSignal?.aborted).toBe(true);
    expect((observedSignal?.reason as Error).message).toBe(
      'operation_server_shutdown',
    );
    expect(repository.cancelClaimedAttemptForLifecycle).toHaveBeenCalledWith({
      organizationId: 'df3b198e-5b31-4f86-b054-bbf4852536a5',
      runId: 'c2e779aa-f5bf-42c2-91f2-dc10be211c71',
      expectedAttemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
      claimedBy: 'operations:test',
      errorCode: 'operation_server_shutdown',
      finishedAt: NOW,
    });
    expect(repository.transition).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refuses an attempt that arrives after shutdown has begun', async () => {
    const dispatcher = { dispatch: vi.fn().mockResolvedValue(undefined) };
    const executor = new OperationAttemptExecutorService(
      dispatcher as never,
      { heartbeatRun: vi.fn(), transition: vi.fn() } as never,
    );
    executor.abortAll(new Error('operation_server_shutdown'));

    await executor.execute(run());

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts the attempt when a checkpoint heartbeat rejects', async () => {
    let observedSignal: AbortSignal | undefined;
    const executor = new OperationAttemptExecutorService(
      {
        dispatch: vi.fn(async (_run, controls: {
          signal: AbortSignal;
          checkpoint(): Promise<void>;
        }) => {
          observedSignal = controls.signal;
          await controls.checkpoint();
        }),
      } as never,
      {
        heartbeatRun: vi.fn().mockRejectedValue(new Error('database unavailable')),
        transition: vi.fn(),
      } as never,
    );

    await executor.execute(run());

    expect(observedSignal?.aborted).toBe(true);
    expect((observedSignal?.reason as Error).message).toBe(
      'operation_attempt_heartbeat_failed',
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('serializes lease heartbeats so a slow renewal cannot shorten a newer lease', async () => {
    const firstHeartbeat = deferred<OperationRunRecord | null>();
    const dispatch = deferred<void>();
    const repository = {
      heartbeatRun: vi.fn()
        .mockReturnValueOnce(firstHeartbeat.promise)
        .mockResolvedValue(run()),
      transition: vi.fn(),
    };
    const executor = new OperationAttemptExecutorService(
      { dispatch: vi.fn().mockReturnValue(dispatch.promise) } as never,
      repository as never,
    );

    const execution = executor.execute(run());
    await vi.advanceTimersByTimeAsync(600);
    expect(repository.heartbeatRun).toHaveBeenCalledTimes(1);

    firstHeartbeat.resolve(run());
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.heartbeatRun).toHaveBeenCalledTimes(2);

    dispatch.resolve();
    await execution;
  });

  it('does not return from shutdown until an in-flight heartbeat is settled', async () => {
    const heartbeat = deferred<OperationRunRecord | null>();
    const executor = new OperationAttemptExecutorService(
      {
        dispatch: vi.fn((_run, controls: { signal: AbortSignal }) =>
          new Promise<void>((resolve) => {
            controls.signal.addEventListener('abort', () => resolve(), { once: true });
          })),
      } as never,
      {
        heartbeatRun: vi.fn().mockReturnValue(heartbeat.promise),
        transition: vi.fn(),
        cancelClaimedAttemptForLifecycle: vi.fn().mockResolvedValue(false),
      } as never,
    );

    let settled = false;
    const execution = executor.execute(run()).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(300);
    executor.abortAll(new Error('operation_server_shutdown'));
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(false);

    heartbeat.resolve(null);
    await execution;
    expect(settled).toBe(true);
  });

  it('drains an in-flight heartbeat before finalizing an expired deadline', async () => {
    const heartbeat = deferred<OperationRunRecord | null>();
    const repository = {
      heartbeatRun: vi.fn().mockReturnValue(heartbeat.promise),
      transition: vi.fn().mockResolvedValue(run({ status: 'failed' })),
    };
    const executor = new OperationAttemptExecutorService(
      {
        dispatch: vi.fn((_run, controls: { signal: AbortSignal }) =>
          new Promise<void>((resolve) => {
            controls.signal.addEventListener('abort', () => resolve(), { once: true });
          })),
      } as never,
      repository as never,
    );

    const execution = executor.execute(run({
      deadlineAt: new Date(NOW.getTime() + 1_000),
    }));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(repository.transition).not.toHaveBeenCalled();

    heartbeat.resolve(null);
    await execution;
    expect(repository.transition).toHaveBeenCalledWith(expect.objectContaining({
      expectedAttemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
      errorCode: 'operation_deadline_exceeded',
    }));
  });

  it('lets deadline failure win when completion is waiting on the atomic attempt fence', async () => {
    const completionFence = deferred<OperationRunRecord | null>();
    const repository = {
      heartbeatRun: vi.fn().mockResolvedValue(run()),
      transitionActiveAttempt: vi.fn().mockReturnValue(completionFence.promise),
      transition: vi.fn().mockResolvedValue(run({ status: 'failed' })),
    };
    const dispatcher = new OperationDispatcherService(
      {
        getDefinition: vi.fn().mockReturnValue({ successPersistence: 'retained' }),
        getHandler: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue({
            kind: 'completed',
            result: { collected: 3 },
          }),
        }),
      } as never,
      repository as never,
      { waitForChild: vi.fn() } as never,
    );
    const executor = new OperationAttemptExecutorService(
      dispatcher,
      repository as never,
    );

    const execution = executor.execute(run({
      deadlineAt: new Date(NOW.getTime() + 1_000),
    }));
    await vi.waitFor(() => {
      expect(repository.transitionActiveAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'succeeded' }),
      );
    });
    await vi.advanceTimersByTimeAsync(1_000);
    completionFence.resolve(null);
    await execution;

    expect(repository.transition).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      errorCode: 'operation_deadline_exceeded',
      expectedAttemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
    }));
  });
});
