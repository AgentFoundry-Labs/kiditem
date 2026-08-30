import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationLifecycleGateService } from '../operation-lifecycle-gate.service';
import { OperationPostAcceptingHookRegistryService } from '../operation-post-accepting-hook-registry.service';
import { OperationServerLifecycleService } from '../operation-server-lifecycle.service';

const STARTED_AT = new Date('2026-08-13T01:02:03.000Z');
const STARTED_CUTOFF = {
  observedAt: STARTED_AT,
  rawTimestamp: '2026-08-13 01:02:03+00',
};
const OPTIONS = {
  batchSize: 100,
  startupTimeoutMs: 30_000,
  shutdownTimeoutMs: 5_000,
};

function makeDependencies() {
  const events: string[] = [];
  const repository = {
    readLifecycleDatabaseCutoff: vi.fn().mockResolvedValue(STARTED_CUTOFF),
    cancelRunsForLifecycle: vi.fn().mockImplementation(async (input: {
      errorCode: string;
    }) => {
      events.push(`cancel:${input.errorCode}`);
      return { updated: 0, remaining: false };
    }),
    advanceSchedulesPastLifecycleCutoff: vi.fn().mockImplementation(async () => {
      events.push('schedules');
      return { updated: 0, remaining: false };
    }),
  };
  const gate = new OperationLifecycleGateService();
  const scheduler = {
    start: vi.fn(() => events.push('scheduler:start')),
    stopIntake: vi.fn(() => events.push('scheduler:stop')),
    drainUntil: vi.fn(async () => events.push('scheduler:drain')),
  };
  const worker = {
    start: vi.fn(() => events.push('worker:start')),
    stopIntake: vi.fn(() => events.push('worker:stop')),
    drainUntil: vi.fn(async (_deadline: number, includeAttempts?: boolean) =>
      events.push(includeAttempts ? 'worker:drain:all' : 'worker:drain:intake')),
    abortActive: vi.fn(() => events.push('worker:abort')),
  };
  return { events, repository, gate, scheduler, worker };
}

function makeLifecycle(
  dependencies: ReturnType<typeof makeDependencies>,
  options = OPTIONS,
) {
  return new OperationServerLifecycleService(
    dependencies.repository as never,
    dependencies.gate,
    new OperationPostAcceptingHookRegistryService(),
    dependencies.scheduler as never,
    dependencies.worker as never,
    options,
  );
}

function makeLifecycleWithHooks(
  dependencies: ReturnType<typeof makeDependencies>,
  hooks: OperationPostAcceptingHookRegistryService,
  options = OPTIONS,
) {
  const Lifecycle = OperationServerLifecycleService as unknown as new (
    repository: unknown,
    gate: OperationLifecycleGateService,
    hooks: OperationPostAcceptingHookRegistryService,
    scheduler: unknown,
    worker: unknown,
    lifecycleOptions: typeof OPTIONS,
  ) => OperationServerLifecycleService;
  return new Lifecycle(
    dependencies.repository,
    dependencies.gate,
    hooks,
    dependencies.scheduler,
    dependencies.worker,
    options,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(STARTED_AT);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('OperationServerLifecycleService startup', () => {
  it('rejects duplicate post-accepting hooks and runs a frozen priority/key snapshot', async () => {
    const hooks = new OperationPostAcceptingHookRegistryService();
    const order: string[] = [];
    hooks.register({
      key: 'beta',
      priority: 10,
      run: async () => {
        order.push('beta');
        hooks.register({
          key: 'late',
          priority: 0,
          run: async () => order.push('late'),
        });
      },
    });
    hooks.register({
      key: 'alpha',
      priority: 10,
      run: async () => order.push('alpha'),
    });

    expect(() => hooks.register({
      key: 'alpha',
      priority: 20,
      run: async () => undefined,
    })).toThrow('duplicate operation post-accepting hook');

    await hooks.runAll(new AbortController().signal);

    expect(order).toEqual(['alpha', 'beta']);
  });

  it('runs post-accepting hooks before starting intake in exact lifecycle order', async () => {
    const dependencies = makeDependencies();
    const hooks = new OperationPostAcceptingHookRegistryService();
    const open = dependencies.gate.open.bind(dependencies.gate);
    vi.spyOn(dependencies.gate, 'open').mockImplementation(() => {
      dependencies.events.push('open');
      open();
    });
    hooks.register({
      key: 'recover-deletions',
      priority: 20,
      run: vi.fn(async () => dependencies.events.push('recover-deletions')),
    });
    hooks.register({
      key: 'recover-finalizers',
      priority: 10,
      run: vi.fn(async () => dependencies.events.push('recover-finalizers')),
    });
    const lifecycle = makeLifecycleWithHooks(dependencies, hooks);

    await lifecycle.onApplicationBootstrap();

    expect(dependencies.events).toEqual([
      'cancel:operation_server_lifecycle_expired',
      'schedules',
      'open',
      'recover-finalizers',
      'recover-deletions',
      'scheduler:start',
      'worker:start',
    ]);
  });

  it('gives hooks only the remaining shared startup budget after a slow sweep', async () => {
    const dependencies = makeDependencies();
    const hooks = new OperationPostAcceptingHookRegistryService();
    const hookStarted = vi.fn();
    dependencies.repository.cancelRunsForLifecycle.mockImplementationOnce(async () => {
      dependencies.events.push('cancel:operation_server_lifecycle_expired');
      await new Promise<void>((resolve) => setTimeout(resolve, 20_000));
      return { updated: 0, remaining: false };
    });
    hooks.register({
      key: 'bounded-recovery',
      priority: 1,
      run: async (signal) => {
        hookStarted(Date.now());
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      },
    });
    const lifecycle = makeLifecycleWithHooks(dependencies, hooks);

    const bootstrap = lifecycle.onApplicationBootstrap();
    const rejection = expect(bootstrap).rejects.toThrow(
      'operation_server_lifecycle_startup_timeout',
    );
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.waitFor(() => expect(hookStarted).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
    expect(hookStarted).toHaveBeenCalledWith(
      STARTED_AT.getTime() + 20_000,
    );
    expect(dependencies.scheduler.start).not.toHaveBeenCalled();
    expect(dependencies.worker.start).not.toHaveBeenCalled();
  });

  it('rejects at the remaining shared deadline when a post-accepting hook ignores abort', async () => {
    const dependencies = makeDependencies();
    const hooks = new OperationPostAcceptingHookRegistryService();
    dependencies.repository.cancelRunsForLifecycle.mockImplementationOnce(async () => {
      dependencies.events.push('cancel:operation_server_lifecycle_expired');
      await new Promise<void>((resolve) => setTimeout(resolve, 20_000));
      return { updated: 0, remaining: false };
    });
    hooks.register({
      key: 'never-settles',
      priority: 1,
      run: async () => new Promise<void>(() => undefined),
    });
    const lifecycle = makeLifecycleWithHooks(dependencies, hooks);

    const bootstrap = lifecycle.onApplicationBootstrap();
    const outcome = Promise.race([
      bootstrap.then(
        () => 'unexpected_success',
        (error: Error) => error.message,
      ),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('post_accepting_hook_was_unbounded'), 30_000);
      }),
    ]);
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(outcome).resolves.toBe('operation_server_lifecycle_startup_timeout');
    expect(dependencies.gate.state()).toBe('STOPPING');
    expect(dependencies.scheduler.start).not.toHaveBeenCalled();
    expect(dependencies.worker.start).not.toHaveBeenCalled();
  });

  it('fails closed when a post-accepting hook rejects after opening the gate', async () => {
    const dependencies = makeDependencies();
    const hooks = new OperationPostAcceptingHookRegistryService();
    hooks.register({
      key: 'recovery-failure',
      priority: 1,
      run: async () => {
        throw new Error('session_recovery_failed');
      },
    });
    const lifecycle = makeLifecycleWithHooks(dependencies, hooks);

    await expect(lifecycle.onApplicationBootstrap()).rejects.toThrow(
      'session_recovery_failed',
    );
    expect(dependencies.gate.state()).toBe('STOPPING');
    expect(dependencies.scheduler.start).not.toHaveBeenCalled();
    expect(dependencies.worker.start).not.toHaveBeenCalled();
  });

  it('drains runs then schedules before opening intake in exact order', async () => {
    const dependencies = makeDependencies();
    const lifecycle = makeLifecycle(dependencies);

    await lifecycle.onApplicationBootstrap();

    expect(dependencies.events).toEqual([
      'cancel:operation_server_lifecycle_expired',
      'schedules',
      'scheduler:start',
      'worker:start',
    ]);
    expect(dependencies.gate.state()).toBe('ACCEPTING');
    expect(dependencies.repository.cancelRunsForLifecycle).toHaveBeenCalledWith({
      cutoff: STARTED_CUTOFF,
      errorCode: 'operation_server_lifecycle_expired',
      errorMessage: 'Operation cancelled because its API server lifecycle expired',
      finishedAt: STARTED_AT,
      limit: 100,
      statementTimeoutMs: 30_000,
    });
    expect(dependencies.repository.advanceSchedulesPastLifecycleCutoff)
      .toHaveBeenCalledWith({
        cutoff: STARTED_CUTOFF,
        limit: 100,
        statementTimeoutMs: 30_000,
      });
  });

  it('retries zero-updated remaining batches after a bounded 10ms yield', async () => {
    const dependencies = makeDependencies();
    dependencies.repository.cancelRunsForLifecycle
      .mockResolvedValueOnce({ updated: 0, remaining: true })
      .mockResolvedValueOnce({ updated: 1, remaining: false });
    const lifecycle = makeLifecycle(dependencies);

    const bootstrap = lifecycle.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(10);
    await bootstrap;

    expect(dependencies.repository.cancelRunsForLifecycle).toHaveBeenCalledTimes(2);
    expect(dependencies.repository.cancelRunsForLifecycle.mock.calls.map(
      ([input]) => input.cutoff,
    )).toEqual([STARTED_CUTOFF, STARTED_CUTOFF]);
    expect(dependencies.repository.advanceSchedulesPastLifecycleCutoff)
      .toHaveBeenCalledWith(expect.objectContaining({ cutoff: STARTED_CUTOFF }));
    expect(dependencies.repository.cancelRunsForLifecycle.mock.calls[1]?.[0])
      .toMatchObject({ statementTimeoutMs: 29_990 });
    expect(dependencies.gate.state()).toBe('ACCEPTING');
  });

  it('fails closed on one shared startup deadline and never starts intake', async () => {
    const dependencies = makeDependencies();
    dependencies.repository.cancelRunsForLifecycle.mockImplementation(async () => ({
      updated: 0,
      remaining: true,
    }));
    const lifecycle = makeLifecycle(dependencies, {
      ...OPTIONS,
      startupTimeoutMs: 100,
    });

    const bootstrap = lifecycle.onApplicationBootstrap();
    const rejection = expect(bootstrap).rejects.toThrow(
      'operation_server_lifecycle_startup_timeout',
    );
    await vi.advanceTimersByTimeAsync(100);
    await rejection;

    expect(dependencies.gate.state()).toBe('BOOTSTRAPPING');
    expect(dependencies.scheduler.start).not.toHaveBeenCalled();
    expect(dependencies.worker.start).not.toHaveBeenCalled();
    for (const [input] of dependencies.repository.cancelRunsForLifecycle.mock.calls) {
      expect(input.statementTimeoutMs).toBeGreaterThan(0);
      expect(input.statementTimeoutMs).toBeLessThanOrEqual(100);
    }
  });

  it('propagates a database failure and leaves BOOTSTRAPPING closed', async () => {
    const dependencies = makeDependencies();
    dependencies.repository.cancelRunsForLifecycle.mockRejectedValue(
      new Error('database_unavailable'),
    );
    const lifecycle = makeLifecycle(dependencies);

    await expect(lifecycle.onApplicationBootstrap()).rejects.toThrow(
      'database_unavailable',
    );
    expect(dependencies.gate.state()).toBe('BOOTSTRAPPING');
    expect(dependencies.scheduler.start).not.toHaveBeenCalled();
    expect(dependencies.worker.start).not.toHaveBeenCalled();
  });

  it('fails closed when reading the database cutoff consumes the shared startup deadline', async () => {
    const dependencies = makeDependencies();
    dependencies.repository.readLifecycleDatabaseCutoff.mockReturnValue(
      new Promise<typeof STARTED_CUTOFF>(() => undefined),
    );
    const lifecycle = makeLifecycle(dependencies, {
      ...OPTIONS,
      startupTimeoutMs: 100,
    });
    const bootstrap = lifecycle.onApplicationBootstrap();
    const outcome = Promise.race([
      bootstrap.then(
        () => 'unexpected_success',
        (error: Error) => error.message,
      ),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('database_cutoff_read_was_unbounded'), 101);
      }),
    ]);

    await vi.advanceTimersByTimeAsync(101);
    await expect(outcome).resolves.toBe(
      'operation_server_lifecycle_startup_timeout',
    );
    expect(dependencies.gate.state()).toBe('BOOTSTRAPPING');
    expect(dependencies.scheduler.start).not.toHaveBeenCalled();
    expect(dependencies.worker.start).not.toHaveBeenCalled();
  });
});

describe('OperationServerLifecycleService shutdown', () => {
  it('stops intake synchronously, then first-sweeps, aborts/drains, and final-sweeps', async () => {
    const dependencies = makeDependencies();
    const lifecycle = makeLifecycle(dependencies);
    await lifecycle.onApplicationBootstrap();
    dependencies.events.length = 0;

    const destroy = lifecycle.onModuleDestroy();
    expect(dependencies.events.slice(0, 2)).toEqual([
      'scheduler:stop',
      'worker:stop',
    ]);
    await destroy;
    expect(dependencies.events).toEqual([
      'scheduler:stop',
      'worker:stop',
      'scheduler:drain',
      'worker:drain:intake',
      'cancel:operation_server_shutdown',
      'worker:abort',
      'worker:drain:all',
    ]);
    expect(dependencies.gate.state()).toBe('STOPPING');

    await lifecycle.beforeApplicationShutdown();

    expect(dependencies.events.at(-1)).toBe(
      'cancel:operation_server_shutdown',
    );
    expect(dependencies.repository.cancelRunsForLifecycle).toHaveBeenCalledTimes(3);
    const shutdownCalls = dependencies.repository.cancelRunsForLifecycle.mock.calls
      .slice(1)
      .map(([input]) => input);
    expect(shutdownCalls).toEqual([
      expect.objectContaining({ cutoff: null, errorCode: 'operation_server_shutdown' }),
      expect.objectContaining({ cutoff: null, errorCode: 'operation_server_shutdown' }),
    ]);
    expect(dependencies.gate.state()).toBe('STOPPED');
  });

  it('leaves STOPPING and throws when either shutdown sweep cannot finish', async () => {
    const dependencies = makeDependencies();
    const warn = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const lifecycle = makeLifecycle(dependencies);
    await lifecycle.onApplicationBootstrap();
    dependencies.repository.cancelRunsForLifecycle.mockResolvedValue({
      updated: 0,
      remaining: true,
    });

    const destroy = lifecycle.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(5_000);
    await destroy;
    const finalSweep = lifecycle.beforeApplicationShutdown();
    const rejection = expect(finalSweep).rejects.toThrow(
      'operation_server_lifecycle_cleanup_failed',
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await rejection;

    expect(dependencies.gate.state()).toBe('STOPPING');
    expect(warn).toHaveBeenCalledWith(
      'operation_server_lifecycle_cleanup_failed',
      expect.anything(),
    );
  });

  it('still executes the final bounded sweep after the first shutdown deadline is exhausted', async () => {
    const dependencies = makeDependencies();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const lifecycle = makeLifecycle(dependencies, {
      ...OPTIONS,
      shutdownTimeoutMs: 100,
    });
    await lifecycle.onApplicationBootstrap();
    dependencies.repository.cancelRunsForLifecycle.mockClear();
    dependencies.scheduler.drainUntil.mockImplementation(async () => {
      vi.setSystemTime(new Date(STARTED_AT.getTime() + 100));
    });

    await lifecycle.onModuleDestroy();
    await expect(lifecycle.beforeApplicationShutdown()).rejects.toThrow(
      'operation_server_lifecycle_cleanup_failed',
    );

    expect(dependencies.repository.cancelRunsForLifecycle).toHaveBeenCalledTimes(1);
    expect(dependencies.repository.cancelRunsForLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        cutoff: null,
        errorCode: 'operation_server_shutdown',
        statementTimeoutMs: 100,
      }),
    );
  });
});
