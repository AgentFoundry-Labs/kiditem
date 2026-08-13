import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationResourceClass } from '@kiditem/shared/operations';
import type { OperationRunRecord } from '../../port/out/repository/operation.repository.port';
import { OperationRunWorkerService } from '../operation-run-worker.service';

const NOW = new Date('2026-08-13T01:02:03.000Z');
const originalLimits = process.env.OPERATION_RESOURCE_CLASS_LIMITS;
const originalLeaseMs = process.env.OPERATION_RUN_LEASE_MS;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
      claimNextRun: vi.fn().mockResolvedValue(null),
    };
    const compositeCoordinator = {
      resumeTerminalChildren: vi.fn().mockReturnValue(blockedResume.promise),
    };
    const worker = new OperationRunWorkerService(
      { execute: vi.fn() } as never,
      repository as never,
      compositeCoordinator as never,
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

  it('sweeps deadlines before one resource-filtered null claim per class', async () => {
    const events: string[] = [];
    const repository = {
      expirePastDeadlineRuns: vi.fn().mockImplementation(async () => {
        events.push('sweep');
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
    );

    await worker.tick();

    expect(events[0]).toBe('sweep');
    expect(repository.expirePastDeadlineRuns).toHaveBeenCalledWith({
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

  it('aborts active executors and refuses new claims after module destroy', async () => {
    const repository = {
      expirePastDeadlineRuns: vi.fn().mockResolvedValue(0),
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
    );

    await worker.onModuleDestroy();
    await worker.tick();

    expect(executor.abortAll).toHaveBeenCalledWith(expect.objectContaining({
      message: 'operation_worker_shutdown',
    }));
    expect(repository.claimNextRun).not.toHaveBeenCalled();
  });

  it('waits for active attempts and composite resume to settle during shutdown', async () => {
    const attempt = deferred<void>();
    const resume = deferred<void>();
    const repository = {
      expirePastDeadlineRuns: vi.fn().mockResolvedValue(0),
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
    );
    await worker.tick();

    let destroyed = false;
    const shutdown = Promise.resolve(worker.onModuleDestroy()).finally(() => {
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
      claimNextRun: vi.fn(({ resourceClass }: { resourceClass: OperationResourceClass }) =>
        resourceClass === 'naver_api' ? claim.promise : Promise.resolve(null)),
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
    );
    const tick = worker.tick();
    await vi.waitFor(() => expect(repository.claimNextRun).toHaveBeenCalled());

    let destroyed = false;
    const shutdown = Promise.resolve(worker.onModuleDestroy()).finally(() => {
      destroyed = true;
    });
    await Promise.resolve();
    expect(destroyed).toBe(false);

    claim.resolve(run('naver_api', 'claimed-during-shutdown'));
    await Promise.all([tick, shutdown]);

    expect(executor.execute).not.toHaveBeenCalled();
    expect(compositeCoordinator.resumeTerminalChildren).toHaveBeenCalledOnce();
    expect(destroyed).toBe(true);
  });
});
