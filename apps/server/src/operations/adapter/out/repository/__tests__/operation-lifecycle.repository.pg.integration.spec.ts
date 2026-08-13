import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../../../test-helpers/real-prisma';
import { OperationRepositoryAdapter } from '../operation.repository.adapter';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('operation lifecycle repository PostgreSQL boundaries', () => {
  let locker: PrismaClient;
  let updater: PrismaClient;
  let repository: OperationRepositoryAdapter;

  beforeAll(async () => {
    locker = makeTestPrisma();
    updater = makeTestPrisma();
    repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );
    await Promise.all([locker.$connect(), updater.$connect()]);
  });

  afterAll(async () => {
    await Promise.all([locker.$disconnect(), updater.$disconnect()]);
  });

  beforeEach(async () => {
    await resetDb(locker);
    await seedBaseFixture(locker);
  });

  it('cancels every owner and active status through cutoff equality while preserving the execution ledger', async () => {
    const cutoff = new Date('2026-08-13T01:02:03.000Z');
    const afterCutoff = new Date(cutoff.getTime() + 1);
    const finishedAt = new Date('2026-08-13T01:03:00.000Z');
    const startedAt = new Date('2026-08-13T00:59:00.000Z');
    const stageUpdatedAt = new Date('2026-08-13T01:00:00.000Z');
    const deadlineAt = new Date('2026-08-13T02:00:00.000Z');
    const scheduledFor = new Date('2026-08-13T01:01:00.000Z');
    const claimedAt = new Date('2026-08-13T01:01:30.000Z');
    const leaseExpiresAt = new Date('2026-08-13T01:04:00.000Z');
    const schedule = await locker.operationSchedule.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'test.lifecycle.schedule',
        cronExpression: '0 * * * *',
        timeZone: 'UTC',
        misfirePolicy: 'skip',
        enabled: true,
        nextRunAt: new Date('2026-08-13T02:00:00.000Z'),
        createdByUserId: TEST_USER_ID,
      },
    });
    const parent = await locker.operationRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'test.lifecycle.parent',
        definitionVersion: 1,
        ownerDomain: 'operations',
        title: 'Lifecycle parent',
        engineType: 'server',
        resourceClass: 'default',
        executionTimeoutMs: 60_000,
        status: 'succeeded',
        triggerSource: 'dashboard',
        input: {},
        result: { parent: true },
        attempts: 1,
        maxAttempts: 3,
        startedAt,
        finishedAt: startedAt,
        createdAt: new Date(cutoff.getTime() - 10_000),
      },
    });

    const activeCases = [
      ['queued', 'sourcing'],
      ['waiting_runtime', 'supply'],
      ['waiting_dependency', 'ai'],
      ['running', 'automation'],
    ] as const;
    const activeIds: string[] = [];
    for (const [status, ownerDomain] of activeCases) {
      const id = randomUUID();
      activeIds.push(id);
      await locker.operationRun.create({
        data: {
          id,
          organizationId: TEST_ORGANIZATION_ID,
          operationKey: `test.lifecycle.${status}`,
          definitionVersion: 7,
          ownerDomain,
          title: `${ownerDomain} ${status}`,
          engineType: 'server',
          resourceClass: 'default',
          executionTimeoutMs: 60_000,
          status,
          triggerSource: 'dashboard',
          requestedByUserId: TEST_USER_ID,
          parentRunId: parent.id,
          scheduleId: schedule.id,
          idempotencyKey: `lifecycle:${status}`,
          input: { original: status },
          result: { partial: ownerDomain },
          progress: 0.25,
          stage: 'collecting_keyword',
          stageUpdatedAt,
          progressCurrent: 1,
          progressTotal: 4,
          deadlineAt,
          nativeRunType: 'fixture',
          nativeRunId: `native:${status}`,
          attempts: 2,
          maxAttempts: 5,
          claimedBy: `operations-${status}`,
          attemptToken: randomUUID(),
          claimedAt,
          leaseExpiresAt,
          scheduledFor,
          startedAt,
          createdAt: cutoff,
        },
      });
    }

    const futureId = randomUUID();
    await locker.operationRun.create({
      data: {
        id: futureId,
        organizationId: OTHER_ORGANIZATION_ID,
        operationKey: 'test.lifecycle.future',
        definitionVersion: 1,
        ownerDomain: 'orders',
        title: 'Created after cutoff',
        engineType: 'server',
        resourceClass: 'default',
        executionTimeoutMs: 60_000,
        status: 'queued',
        triggerSource: 'schedule',
        input: {},
        attempts: 0,
        maxAttempts: 3,
        createdAt: afterCutoff,
      },
    });
    const terminalId = randomUUID();
    await locker.operationRun.create({
      data: {
        id: terminalId,
        organizationId: OTHER_ORGANIZATION_ID,
        operationKey: 'test.lifecycle.terminal',
        definitionVersion: 1,
        ownerDomain: 'listing',
        title: 'Already terminal',
        engineType: 'server',
        resourceClass: 'default',
        executionTimeoutMs: 60_000,
        status: 'failed',
        triggerSource: 'dashboard',
        input: {},
        attempts: 1,
        maxAttempts: 3,
        errorCode: 'original_failure',
        errorMessage: 'Keep me',
        finishedAt: startedAt,
        createdAt: cutoff,
      },
    });

    await expect(repository.cancelRunsForLifecycle({
      cutoff,
      errorCode: 'operation_server_lifecycle_expired',
      errorMessage: 'Operation belonged to an expired API lifecycle',
      finishedAt,
      limit: 100,
      statementTimeoutMs: 2_000,
    })).resolves.toEqual({ updated: 4, remaining: false });

    const cancelled = await locker.operationRun.findMany({
      where: { id: { in: activeIds } },
      orderBy: { operationKey: 'asc' },
    });
    expect(cancelled).toHaveLength(4);
    for (const run of cancelled) {
      expect(run).toMatchObject({
        status: 'cancelled',
        errorCode: 'operation_server_lifecycle_expired',
        errorMessage: 'Operation belonged to an expired API lifecycle',
        finishedAt,
        claimedBy: null,
        attemptToken: null,
        claimedAt: null,
        leaseExpiresAt: null,
        attempts: 2,
        startedAt,
        progress: 0.25,
        stage: 'collecting_keyword',
        stageUpdatedAt,
        progressCurrent: 1,
        progressTotal: 4,
        deadlineAt,
        scheduleId: schedule.id,
        parentRunId: parent.id,
        result: { partial: run.ownerDomain },
        maxAttempts: 5,
        scheduledFor,
      });
      expect(run.idempotencyKey).toBe(`lifecycle:${run.status === 'cancelled'
        ? run.operationKey.split('.').at(-1)
        : ''}`);
      expect(run.input).toEqual({ original: run.operationKey.split('.').at(-1) });
      expect(run.nativeRunType).toBe('fixture');
    }
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: futureId },
      select: { status: true, errorCode: true },
    })).resolves.toEqual({ status: 'queued', errorCode: null });
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: terminalId },
      select: {
        status: true,
        errorCode: true,
        errorMessage: true,
        finishedAt: true,
      },
    })).resolves.toEqual({
      status: 'failed',
      errorCode: 'original_failure',
      errorMessage: 'Keep me',
      finishedAt: startedAt,
    });
  });

  it('advances skip and catch-up-once schedules to the first occurrence after the cutoff without creating runs', async () => {
    const cutoff = new Date('2026-08-13T01:30:00.000Z');
    const lastScheduledFor = new Date('2026-08-12T23:00:00.000Z');
    const dueAt = new Date('2026-08-13T01:00:00.000Z');
    const schedules = await Promise.all([
      locker.operationSchedule.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          operationKey: 'test.lifecycle.schedule.skip',
          cronExpression: '0 * * * *',
          timeZone: 'UTC',
          misfirePolicy: 'skip',
          enabled: true,
          nextRunAt: dueAt,
          lastScheduledFor,
          createdByUserId: TEST_USER_ID,
        },
      }),
      locker.operationSchedule.create({
        data: {
          organizationId: OTHER_ORGANIZATION_ID,
          operationKey: 'test.lifecycle.schedule.catch_up_once',
          cronExpression: '0 * * * *',
          timeZone: 'UTC',
          misfirePolicy: 'catch_up_once',
          enabled: true,
          nextRunAt: cutoff,
          lastScheduledFor,
        },
      }),
    ]);

    await expect(repository.advanceSchedulesPastLifecycleCutoff({
      cutoff,
      limit: 100,
      statementTimeoutMs: 2_000,
    })).resolves.toEqual({ updated: 2, remaining: false });

    const updated = await locker.operationSchedule.findMany({
      where: { id: { in: schedules.map(({ id }) => id) } },
      orderBy: { operationKey: 'asc' },
    });
    expect(updated).toHaveLength(2);
    for (const schedule of updated) {
      expect(schedule.nextRunAt).toEqual(new Date('2026-08-13T02:00:00.000Z'));
      expect(schedule.nextRunAt!.getTime()).toBeGreaterThan(cutoff.getTime());
      expect(schedule.lastScheduledFor).toEqual(lastScheduledFor);
    }
    await expect(locker.operationRun.count()).resolves.toBe(0);
  });

  it('reports a locked matching run as remaining until the lock releases', async () => {
    const cutoff = new Date('2026-08-13T01:30:00.000Z');
    const runId = randomUUID();
    await locker.operationRun.create({
      data: {
        id: runId,
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'test.lifecycle.locked_run',
        definitionVersion: 1,
        ownerDomain: 'orders',
        title: 'Locked lifecycle run',
        engineType: 'server',
        resourceClass: 'default',
        executionTimeoutMs: 60_000,
        status: 'waiting_dependency',
        triggerSource: 'dashboard',
        input: {},
        attempts: 1,
        maxAttempts: 3,
        createdAt: cutoff,
      },
    });
    const lockAcquired = deferred();
    const releaseLock = deferred();
    const lockTransaction = locker.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id FROM operation_runs WHERE id = ${runId}::uuid FOR UPDATE
      `;
      lockAcquired.resolve();
      await releaseLock.promise;
    });
    await lockAcquired.promise;

    let lockedResult;
    try {
      lockedResult = await repository.cancelRunsForLifecycle({
        cutoff,
        errorCode: 'operation_server_lifecycle_expired',
        errorMessage: 'Expired lifecycle',
        finishedAt: cutoff,
        limit: 100,
        statementTimeoutMs: 1_000,
      });
    } finally {
      releaseLock.resolve();
      await lockTransaction;
    }
    expect(lockedResult).toEqual({ updated: 0, remaining: true });
    await expect(repository.cancelRunsForLifecycle({
      cutoff,
      errorCode: 'operation_server_lifecycle_expired',
      errorMessage: 'Expired lifecycle',
      finishedAt: cutoff,
      limit: 100,
      statementTimeoutMs: 1_000,
    })).resolves.toEqual({ updated: 1, remaining: false });
  });

  it('reports a locked matching schedule as remaining until the lock releases', async () => {
    const cutoff = new Date('2026-08-13T01:30:00.000Z');
    const schedule = await locker.operationSchedule.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'test.lifecycle.locked_schedule',
        cronExpression: '0 * * * *',
        timeZone: 'UTC',
        misfirePolicy: 'skip',
        enabled: true,
        nextRunAt: cutoff,
        createdByUserId: TEST_USER_ID,
      },
    });
    const lockAcquired = deferred();
    const releaseLock = deferred();
    const lockTransaction = locker.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id FROM operation_schedules WHERE id = ${schedule.id}::uuid FOR UPDATE
      `;
      lockAcquired.resolve();
      await releaseLock.promise;
    });
    await lockAcquired.promise;

    let lockedResult;
    try {
      lockedResult = await repository.advanceSchedulesPastLifecycleCutoff({
        cutoff,
        limit: 100,
        statementTimeoutMs: 1_000,
      });
    } finally {
      releaseLock.resolve();
      await lockTransaction;
    }
    expect(lockedResult).toEqual({ updated: 0, remaining: true });
    await expect(repository.advanceSchedulesPastLifecycleCutoff({
      cutoff,
      limit: 100,
      statementTimeoutMs: 1_000,
    })).resolves.toEqual({ updated: 1, remaining: false });
  });

  it('enforces tenant, token, worker, and status fences for a committed shutdown claim', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    await locker.operationRun.create({
      data: {
        id: runId,
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'test.lifecycle.claim_fence',
        definitionVersion: 1,
        ownerDomain: 'operations',
        title: 'Claim lifecycle fence',
        engineType: 'server',
        resourceClass: 'default',
        executionTimeoutMs: 60_000,
        status: 'running',
        triggerSource: 'dashboard',
        input: {},
        attempts: 2,
        maxAttempts: 3,
        claimedBy: 'operations-lifecycle-test',
        attemptToken,
        claimedAt: new Date('2026-08-13T01:00:00.000Z'),
        leaseExpiresAt: new Date('2026-08-13T01:05:00.000Z'),
        startedAt: new Date('2026-08-13T00:59:00.000Z'),
      },
    });
    const cancel = (
      organizationId: string,
      expectedAttemptToken: string,
      claimedBy: string,
    ) => repository.cancelClaimedAttemptForLifecycle({
      organizationId,
      runId,
      expectedAttemptToken,
      claimedBy,
      errorCode: 'operation_server_shutdown',
      finishedAt: new Date('2026-08-13T01:02:00.000Z'),
    });

    await expect(cancel(OTHER_ORGANIZATION_ID, attemptToken, 'operations-lifecycle-test'))
      .resolves.toBe(false);
    await expect(cancel(TEST_ORGANIZATION_ID, randomUUID(), 'operations-lifecycle-test'))
      .resolves.toBe(false);
    await expect(cancel(TEST_ORGANIZATION_ID, attemptToken, 'operations-other'))
      .resolves.toBe(false);
    await expect(cancel(TEST_ORGANIZATION_ID, attemptToken, 'operations-lifecycle-test'))
      .resolves.toBe(true);
    await expect(cancel(TEST_ORGANIZATION_ID, attemptToken, 'operations-lifecycle-test'))
      .resolves.toBe(false);

    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: {
        status: true,
        attempts: true,
        errorCode: true,
        claimedBy: true,
        attemptToken: true,
      },
    })).resolves.toEqual({
      status: 'cancelled',
      attempts: 2,
      errorCode: 'operation_server_shutdown',
      claimedBy: null,
      attemptToken: null,
    });
  });

  it('terminally cancels only expired server-worker attempts and preserves attempts', async () => {
    const now = new Date('2026-08-13T01:02:00.000Z');
    const createRunning = async (input: {
      key: string;
      claimedBy: string;
      leaseExpiresAt: Date;
    }) => locker.operationRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: input.key,
        definitionVersion: 1,
        ownerDomain: 'operations',
        title: input.key,
        engineType: 'server',
        resourceClass: 'default',
        executionTimeoutMs: 60_000,
        status: 'running',
        triggerSource: 'dashboard',
        input: {},
        attempts: 2,
        maxAttempts: 3,
        claimedBy: input.claimedBy,
        attemptToken: randomUUID(),
        claimedAt: new Date(now.getTime() - 10_000),
        leaseExpiresAt: input.leaseExpiresAt,
        startedAt: new Date(now.getTime() - 20_000),
      },
    });
    const expired = await createRunning({
      key: 'test.lifecycle.expired_worker',
      claimedBy: 'operations-lost-worker',
      leaseExpiresAt: now,
    });
    const browser = await createRunning({
      key: 'test.lifecycle.browser_worker',
      claimedBy: 'office:kiditem-os',
      leaseExpiresAt: now,
    });
    const live = await createRunning({
      key: 'test.lifecycle.live_worker',
      claimedBy: 'operations-live-worker',
      leaseExpiresAt: new Date(now.getTime() + 1),
    });

    await expect(repository.cancelExpiredWorkerAttempts({ now, limit: 100 }))
      .resolves.toBe(1);

    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: expired.id },
      select: {
        status: true,
        attempts: true,
        errorCode: true,
        claimedBy: true,
        attemptToken: true,
      },
    })).resolves.toEqual({
      status: 'cancelled',
      attempts: 2,
      errorCode: 'operation_worker_lost',
      claimedBy: null,
      attemptToken: null,
    });
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: browser.id },
      select: { status: true },
    })).resolves.toEqual({ status: 'running' });
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: live.id },
      select: { status: true },
    })).resolves.toEqual({ status: 'running' });
  });
});
