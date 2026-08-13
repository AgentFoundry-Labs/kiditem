import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationResourceClass } from '@kiditem/shared/operations';
import { Logger } from '@nestjs/common';
import type { OperationRunRecord } from '../../port/out/repository/operation.repository.port';
import { OperationRunWorkerService } from '../operation-run-worker.service';
import { OperationLifecycleGateService } from '../operation-lifecycle-gate.service';

const NOW = new Date('2026-08-13T01:02:03.000Z');
const originalLimits = process.env.OPERATION_RESOURCE_CLASS_LIMITS;
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

function run(
  resourceClass: OperationResourceClass,
  id: string,
): OperationRunRecord {
  return {
    id,
    organizationId: 'df3b198e-5b31-4f86-b054-bbf4852536a5',
    operationKey: 'sourcing.collect_daily_trends',
    definitionVersion: 1,
    ownerDomain: 'sourcing',
    title: 'Collect trends',
    engineType: 'composite',
    resourceClass,
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
    attemptToken: `${id}-token`,
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
  };
}

function acceptingGate(): OperationLifecycleGateService {
  const gate = new OperationLifecycleGateService();
  gate.open();
  return gate;
}

function shutdownWorker(
  worker: OperationRunWorkerService,
  deadline = Date.now() + 5_000,
): Promise<void> {
  const reason = new Error('operation_server_shutdown');
  worker.stopIntake(reason);
  worker.abortActive(reason);
  return worker.drainUntil(deadline, true);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.OPERATION_RESOURCE_CLASS_LIMITS = JSON.stringify({
    default: 1,
    naver_api: 1,
    extension_coupang: 1,
    playwright_1688: 1,
    snapshot_compute: 1,
  });
  process.env.OPERATION_RUN_LEASE_MS = '900';
});

afterEach(() => {
  vi.useRealTimers();
  if (originalLimits === undefined) delete process.env.OPERATION_RESOURCE_CLASS_LIMITS;
  else process.env.OPERATION_RESOURCE_CLASS_LIMITS = originalLimits;
  if (originalLeaseMs === undefined) delete process.env.OPERATION_RUN_LEASE_MS;
  else process.env.OPERATION_RUN_LEASE_MS = originalLeaseMs;
});

describe('OperationRunWorkerService', () => {
  it('starts naver work while a claimed playwright attempt remains blocked', async () => {
    const blockedPlaywright = deferred<void>();
    const claimed = new Set<OperationResourceClass>();
    const repository = {
      expirePastDeadlineRuns: vi.fn().mockResolvedValue(0),
      cancelExpiredWorkerAttempts: vi.fn().mockResolvedValue(0),
      claimNextRun: vi.fn(({ resourceClass }: { resourceClass: OperationResourceClass }) => {
        if (claimed.has(resourceClass)) return Promise.resolve(null);
        claimed.add(resourceClass);
        if (resourceClass === 'playwright_1688') {
          return Promise.resolve(run(resourceClass, 'playwright-run'));
        }
        if (resourceClass === 'naver_api') {
          return Promise.resolve(run(resourceClass, 'naver-run'));
        }
        return Promise.resolve(null);
      }),
    };
    const executor = {
      execute: vi.fn((claimedRun: OperationRunRecord) =>
        claimedRun.resourceClass === 'playwright_1688'
          ? blockedPlaywright.promise
          : Promise.resolve()),
    };
    const worker = new OperationRunWorkerService(
      executor as never,
      repository as never,
      { resumeTerminalChildren: vi.fn().mockResolvedValue(undefined) } as never,
      acceptingGate(),
    );

    await worker.tick();

    expect(executor.execute).toHaveBeenCalledWith(expect.objectContaining({
      resourceClass: 'playwright_1688',
    }));
    expect(executor.execute).toHaveBeenCalledWith(expect.objectContaining({
      resourceClass: 'naver_api',
    }));

    blockedPlaywright.resolve();
    await Promise.resolve();
  });

  it('never exceeds a class capacity when ticks overlap during a claim', async () => {
    const firstClaim = deferred<OperationRunRecord | null>();
    const secondClaim = deferred<OperationRunRecord | null>();
    const activeAttempt = deferred<void>();
    let naverClaimCount = 0;
    const repository = {
      expirePastDeadlineRuns: vi.fn().mockResolvedValue(0),
      cancelExpiredWorkerAttempts: vi.fn().mockResolvedValue(0),
      claimNextRun: vi.fn(({ resourceClass }: { resourceClass: OperationResourceClass }) => {
        if (resourceClass !== 'naver_api') return Promise.resolve(null);
        naverClaimCount += 1;
        return naverClaimCount === 1 ? firstClaim.promise : secondClaim.promise;
      }),
    };
    const executor = { execute: vi.fn().mockReturnValue(activeAttempt.promise) };
    const worker = new OperationRunWorkerService(
      executor as never,
      repository as never,
      { resumeTerminalChildren: vi.fn().mockResolvedValue(undefined) } as never,
      acceptingGate(),
    );

    const tickOne = worker.tick();
    const tickTwo = worker.tick();
    await Promise.resolve();
    await Promise.resolve();
    firstClaim.resolve(run('naver_api', 'naver-run-one'));
    secondClaim.resolve(run('naver_api', 'naver-run-two'));
    await Promise.all([tickOne, tickTwo]);

    const naverExecutions = executor.execute.mock.calls.filter(
      ([claimedRun]) => claimedRun.resourceClass === 'naver_api',
    );
    expect(naverExecutions).toHaveLength(1);

    activeAttempt.resolve();
    await Promise.resolve();
  });

  it('keeps composite resume single-flight without blocking class claims', async () => {
    const blockedResume = deferred<void>();
    const repository = {
      expirePastDeadlineRuns: vi.fn().mockResolvedValue(0),
      cancelExpiredWorkerAttempts: vi.fn().mockResolvedValue(0),
      claimNextRun: vi.fn().mockResolvedValue(null),
    };
    const compositeCoordinator = {
      resumeTerminalChildren: vi.fn().mockReturnValue(blockedResume.promise),
    };
    const worker = new OperationRunWorkerService(
      { execute: vi.fn() } as never,
      repository as never,
      compositeCoordinator as never,
      acceptingGate(),
    );

    const firstTick = worker.tick();
    await Promise.resolve();
    await Promise.resolve();

    expect(repository.claimNextRun).toHaveBeenCalled();
    void worker.tick();
    expect(compositeCoordinator.resumeTerminalChildren).toHaveBeenCalledOnce();

    blockedResume.resolve();
    await firstTick;
  });

  it('sweeps deadlines and lost worker leases before resource-filtered claims', async () => {
    const events: string[] = [];
    const repository = {
      expirePastDeadlineRuns: vi.fn().mockImplementation(async () => {
        events.push('sweep');
        return 0;
      }),
      cancelExpiredWorkerAttempts: vi.fn().mockImplementation(async () => {
        events.push('lost-lease');
        return 0;
      }),
      claimNextRun: vi.fn().mockImplementation(async (
        { resourceClass }: { resourceClass: OperationResourceClass },
      ) => {
        events.push(`claim:${resourceClass}`);
        return null;
      }),
    };
    const executor = { execute: vi.fn() };
    const worker = new OperationRunWorkerService(
      executor as never,
      repository as never,
      { resumeTerminalChildren: vi.fn().mockResolvedValue(undefined) } as never,
      acceptingGate(),
    );

    await worker.tick();

    expect(events.slice(0, 2)).toEqual(['sweep', 'lost-lease']);
    expect(repository.expirePastDeadlineRuns).toHaveBeenCalledWith({
      now: NOW,
      limit: 100,
    });
    expect(repository.cancelExpiredWorkerAttempts).toHaveBeenCalledWith({
      now: NOW,
      limit: 100,
    });
    expect(repository.claimNextRun).toHaveBeenCalledTimes(5);
    expect(new Set(repository.claimNextRun.mock.calls.map(
      ([input]) => input.resourceClass,
    ))).toEqual(new Set([
      'default',
      'naver_api',
      'extension_coupang',
      'playwright_1688',
      'snapshot_compute',
    ]));
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('aborts active executors and refuses new claims after explicit shutdown', async () => {
    const repository = {
      expirePastDeadlineRuns: vi.fn().mockResolvedValue(0),
      cancelExpiredWorkerAttempts: vi.fn().mockResolvedValue(0),
      claimNextRun: vi.fn().mockResolvedValue(null),
    };
    const executor = {
      execute: vi.fn(),
      abortAll: vi.fn(),
    };
    const worker = new OperationRunWorkerService(
      executor as never,
      repository as never,
      { resumeTerminalChildren: vi.fn().mockResolvedValue(undefined) } as never,
      acceptingGate(),
    );

    await shutdownWorker(worker);
    await worker.tick();

    expect(executor.abortAll).toHaveBeenCalledWith(expect.objectContaining({
      message: 'operation_server_shutdown',
    }));
    expect(repository.claimNextRun).not.toHaveBeenCalled();
  });

  it('waits for active attempts and composite resume to settle during shutdown', async () => {
    const attempt = deferred<void>();
    const resume = deferred<void>();
    const repository = {
      expirePastDeadlineRuns: vi.fn().mockResolvedValue(0),
      cancelExpiredWorkerAttempts: vi.fn().mockResolvedValue(0),
      claimNextRun: vi.fn(({ resourceClass }: { resourceClass: OperationResourceClass }) =>
        resourceClass === 'naver_api'
          ? Promise.resolve(run('naver_api', 'naver-active'))
          : Promise.resolve(null)),
    };
    const executor = {
      execute: vi.fn().mockReturnValue(attempt.promise),
      abortAll: vi.fn(),
    };
    const worker = new OperationRunWorkerService(
      executor as never,
      repository as never,
      { resumeTerminalChildren: vi.fn().mockReturnValue(resume.promise) } as never,
      acceptingGate(),
    );
    await worker.tick();

    let destroyed = false;
    const shutdown = shutdownWorker(worker).finally(() => {
      destroyed = true;
    });
    await Promise.resolve();
    expect(destroyed).toBe(false);

    attempt.resolve();
    await Promise.resolve();
    expect(destroyed).toBe(false);

    resume.resolve();
    await shutdown;
    expect(destroyed).toBe(true);
  });

  it('waits for an in-flight claim and does not start its attempt after shutdown', async () => {
    const claim = deferred<OperationRunRecord | null>();
    const repository = {
      expirePastDeadlineRuns: vi.fn().mockResolvedValue(0),
      cancelExpiredWorkerAttempts: vi.fn().mockResolvedValue(0),
      claimNextRun: vi.fn(({ resourceClass }: { resourceClass: OperationResourceClass }) =>
        resourceClass === 'naver_api' ? claim.promise : Promise.resolve(null)),
      cancelClaimedAttemptForLifecycle: vi.fn().mockResolvedValue(true),
    };
    const executor = {
      execute: vi.fn(),
      abortAll: vi.fn(),
    };
    const compositeCoordinator = {
      resumeTerminalChildren: vi.fn().mockResolvedValue(undefined),
    };
    const worker = new OperationRunWorkerService(
      executor as never,
      repository as never,
      compositeCoordinator as never,
      acceptingGate(),
    );
    const tick = worker.tick();
    await vi.waitFor(() => expect(repository.claimNextRun).toHaveBeenCalled());

    let destroyed = false;
    const shutdown = shutdownWorker(worker).finally(() => {
      destroyed = true;
    });
    await Promise.resolve();
    expect(destroyed).toBe(false);

    claim.resolve(run('naver_api', 'claimed-during-shutdown'));
    await Promise.all([tick, shutdown]);

    expect(executor.execute).not.toHaveBeenCalled();
    expect(repository.cancelClaimedAttemptForLifecycle).toHaveBeenCalledWith({
      organizationId: 'df3b198e-5b31-4f86-b054-bbf4852536a5',
      runId: 'claimed-during-shutdown',
      expectedAttemptToken: 'claimed-during-shutdown-token',
      claimedBy: `operations-${process.pid}`,
      errorCode: 'operation_server_shutdown',
      finishedAt: expect.any(Date),
    });
    expect(compositeCoordinator.resumeTerminalChildren).toHaveBeenCalledOnce();
    expect(destroyed).toBe(true);
  });

  it('keeps shutdown-cancel fence loss quiet without retrying or dispatching', async () => {
    const claim = deferred<OperationRunRecord | null>();
    const cancellationError = new Error('operation_shutdown_cancel_fence_lost');
    const repository = {
      expirePastDeadlineRuns: vi.fn().mockResolvedValue(0),
      cancelExpiredWorkerAttempts: vi.fn().mockResolvedValue(0),
      claimNextRun: vi.fn(({ resourceClass }: { resourceClass: OperationResourceClass }) =>
        resourceClass === 'naver_api' ? claim.promise : Promise.resolve(null)),
      cancelClaimedAttemptForLifecycle: vi.fn().mockRejectedValue(cancellationError),
    };
    const executor = { execute: vi.fn(), abortAll: vi.fn() };
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const worker = new OperationRunWorkerService(
      executor as never,
      repository as never,
      { resumeTerminalChildren: vi.fn().mockResolvedValue(undefined) } as never,
      acceptingGate(),
    );
    const tick = worker.tick();
    await vi.waitFor(() => expect(repository.claimNextRun).toHaveBeenCalled());
    const shutdown = shutdownWorker(worker);

    claim.resolve(run('naver_api', 'rollback-fence-lost'));
    await Promise.all([tick, shutdown]);

    expect(repository.cancelClaimedAttemptForLifecycle).toHaveBeenCalledOnce();
    expect(executor.execute).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Operation run worker tick failed'),
    );
  });

  it('aborts a selected in-flight repository claim and treats it as quiet shutdown', async () => {
    const selected = deferred<void>();
    let claimSignal: AbortSignal | undefined;
    const repository = {
      expirePastDeadlineRuns: vi.fn().mockResolvedValue(0),
      cancelExpiredWorkerAttempts: vi.fn().mockResolvedValue(0),
      claimNextRun: vi.fn(async (input: {
        resourceClass: OperationResourceClass;
        signal: AbortSignal;
      }) => {
        if (input.resourceClass !== 'naver_api') return null;
        claimSignal = input.signal;
        await selected.promise;
        input.signal.throwIfAborted();
        return run('naver_api', 'selected-during-shutdown');
      }),
    };
    const executor = { execute: vi.fn(), abortAll: vi.fn() };
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const worker = new OperationRunWorkerService(
      executor as never,
      repository as never,
      { resumeTerminalChildren: vi.fn().mockResolvedValue(undefined) } as never,
      acceptingGate(),
    );
    const tick = worker.tick();
    await vi.waitFor(() => expect(claimSignal).toBeDefined());

    const shutdown = shutdownWorker(worker);
    expect(claimSignal?.aborted).toBe(true);
    selected.resolve();
    await Promise.all([tick, shutdown]);

    expect(executor.execute).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Operation run worker tick failed'),
    );
  });

  it('bounds shutdown while an active attempt never settles', async () => {
    const repository = {
      expirePastDeadlineRuns: vi.fn().mockResolvedValue(0),
      cancelExpiredWorkerAttempts: vi.fn().mockResolvedValue(0),
      claimNextRun: vi.fn(({ resourceClass }: { resourceClass: OperationResourceClass }) =>
        resourceClass === 'naver_api'
          ? Promise.resolve(run('naver_api', 'naver-never-settles'))
          : Promise.resolve(null)),
    };
    const executor = {
      execute: vi.fn().mockReturnValue(new Promise<void>(() => undefined)),
      abortAll: vi.fn(),
    };
    const worker = new OperationRunWorkerService(
      executor as never,
      repository as never,
      { resumeTerminalChildren: vi.fn().mockResolvedValue(undefined) } as never,
      acceptingGate(),
    );
    await worker.tick();

    let destroyed = false;
    const shutdown = shutdownWorker(worker).finally(() => {
      destroyed = true;
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(destroyed).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(destroyed).toBe(true);
    await shutdown;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds pending claim and composite drains and observes their late rejections', async () => {
    const attempt = deferred<void>();
    const claim = deferred<OperationRunRecord | null>();
    const resume = deferred<void>();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const repository = {
      expirePastDeadlineRuns: vi.fn().mockResolvedValue(0),
      cancelExpiredWorkerAttempts: vi.fn().mockResolvedValue(0),
      claimNextRun: vi.fn(({ resourceClass }: { resourceClass: OperationResourceClass }) => {
        if (resourceClass === 'naver_api') {
          return Promise.resolve(run('naver_api', 'naver-late-rejection'));
        }
        if (resourceClass === 'playwright_1688') return claim.promise;
        return Promise.resolve(null);
      }),
    };
    const executor = {
      execute: vi.fn().mockReturnValue(attempt.promise),
      abortAll: vi.fn(),
    };
    const compositeCoordinator = {
      resumeTerminalChildren: vi.fn().mockReturnValue(resume.promise),
    };
    const worker = new OperationRunWorkerService(
      executor as never,
      repository as never,
      compositeCoordinator as never,
      acceptingGate(),
    );

    const tick = worker.tick();
    await vi.waitFor(() => {
      expect(executor.execute).toHaveBeenCalledOnce();
      expect(repository.claimNextRun).toHaveBeenCalledWith(expect.objectContaining({
        resourceClass: 'playwright_1688',
      }));
    });
    const claimsBeforeShutdown = repository.claimNextRun.mock.calls.length;
    const resumesBeforeShutdown = compositeCoordinator.resumeTerminalChildren.mock.calls.length;

    const shutdown = shutdownWorker(worker);
    await vi.advanceTimersByTimeAsync(5_000);
    await shutdown;
    await worker.tick();

    expect(repository.claimNextRun).toHaveBeenCalledTimes(claimsBeforeShutdown);
    expect(compositeCoordinator.resumeTerminalChildren).toHaveBeenCalledTimes(
      resumesBeforeShutdown,
    );
    expect(vi.getTimerCount()).toBe(0);

    attempt.reject(new Error('late attempt failure'));
    claim.reject(new Error('late claim failure'));
    resume.reject(new Error('late composite failure'));
    await tick;
    await vi.advanceTimersByTimeAsync(0);
    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
  });
});
