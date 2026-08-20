import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationLifecycleGateService } from '../operation-lifecycle-gate.service';
import { OperationServerLifecycleService } from '../operation-server-lifecycle.service';

const STARTED_AT = new Date('2026-08-13T01:02:03.000Z');
const OPTIONS = {
  batchSize: 100,
  startupTimeoutMs: 30_000,
  shutdownTimeoutMs: 5_000,
};

function makeDependencies() {
  const events: string[] = [];
  const repository = {
    readLifecycleDatabaseTime: vi.fn().mockResolvedValue(STARTED_AT),
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
    dependencies.scheduler as never,
    dependencies.worker as never,
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
      cutoff: STARTED_AT,
      errorCode: 'operation_server_lifecycle_expired',
      errorMessage: 'Operation cancelled because its API server lifecycle expired',
      finishedAt: STARTED_AT,
      limit: 100,
      statementTimeoutMs: 30_000,
    });
    expect(dependencies.repository.advanceSchedulesPastLifecycleCutoff)
      .toHaveBeenCalledWith({
        cutoff: STARTED_AT,
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
    dependencies.repository.readLifecycleDatabaseTime.mockReturnValue(
      new Promise<Date>(() => undefined),
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
