import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { transitionActiveServerAttempt } from '../operation-execution.repository';
import { OperationRepositoryAdapter } from '../operation.repository.adapter';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../../../../prisma/prisma.service';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('operation execution repository PostgreSQL fencing', () => {
  let locker: PrismaClient;
  let updater: PrismaClient;

  beforeAll(async () => {
    locker = makeTestPrisma();
    updater = makeTestPrisma();
    await Promise.all([locker.$connect(), updater.$connect()]);
  });

  afterAll(async () => {
    await Promise.all([locker.$disconnect(), updater.$disconnect()]);
  });

  beforeEach(async () => {
    await resetDb(locker);
    await seedBaseFixture(locker);
  });

  it('rejects a terminal transition that waited on a row lock past its deadline', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    const [{ deadline_at: deadlineAt }] = await locker.$queryRaw<
      Array<{ deadline_at: Date }>
    >`SELECT clock_timestamp() + interval '2 seconds' AS deadline_at`;
    await locker.operationRun.create({
      data: {
        id: runId,
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'test.row_lock_deadline',
        definitionVersion: 1,
        ownerDomain: 'operations',
        title: 'Row lock deadline test',
        engineType: 'server',
        resourceClass: 'default',
        executionTimeoutMs: 10_000,
        status: 'running',
        triggerSource: 'dashboard',
        input: {},
        attempts: 1,
        maxAttempts: 3,
        claimedBy: 'operations:integration-test',
        attemptToken,
        claimedAt: new Date(),
        leaseExpiresAt: new Date(deadlineAt.getTime() + 10_000),
        deadlineAt,
        startedAt: new Date(),
      },
    });

    const lockAcquired = deferred();
    const terminalTransitionStarted = deferred();
    const lockTransaction = locker.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM operation_runs
        WHERE id = ${runId}::uuid
        FOR UPDATE
      `;
      lockAcquired.resolve();
      await terminalTransitionStarted.promise;
      await transaction.$queryRaw`
        SELECT pg_sleep(
          GREATEST(
            0,
            EXTRACT(EPOCH FROM (${deadlineAt}::timestamptz - clock_timestamp())) + 0.2
          )
        ) IS NULL AS slept
      `;
    });
    await lockAcquired.promise;
    const [{ before_deadline: beforeDeadline }] = await updater.$queryRaw<
      Array<{ before_deadline: boolean }>
    >`SELECT clock_timestamp() < ${deadlineAt}::timestamptz AS before_deadline`;
    expect(beforeDeadline).toBe(true);

    const transitioned = transitionActiveServerAttempt(
      updater as unknown as PrismaService,
      {
        organizationId: TEST_ORGANIZATION_ID,
        runId,
        expectedStatuses: ['running'],
        expectedAttemptToken: attemptToken,
        status: 'succeeded',
        progress: 1,
        result: { completed: true },
        finishedAt: new Date(),
        claimedBy: null,
        attemptToken: null,
        claimedAt: null,
        leaseExpiresAt: null,
      },
    );
    terminalTransitionStarted.resolve();

    await lockTransaction;
    await expect(transitioned).resolves.toBe(false);
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: {
        status: true,
        result: true,
        attemptToken: true,
      },
    })).resolves.toEqual({
      status: 'running',
      result: null,
      attemptToken,
    });
  });

  it('rejects a same-token browser terminal report blocked past its deadline', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    const [{ deadline_at: deadlineAt }] = await locker.$queryRaw<
      Array<{ deadline_at: Date }>
    >`SELECT clock_timestamp() + interval '2 seconds' AS deadline_at`;
    await createBrowserRun(locker, {
      runId,
      attemptToken,
      deadlineAt,
      leaseExpiresAt: new Date(deadlineAt.getTime() + 10_000),
    });

    const lockAcquired = deferred();
    const terminalTransitionStarted = deferred();
    const lockTransaction = locker.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM operation_runs
        WHERE id = ${runId}::uuid
        FOR UPDATE
      `;
      lockAcquired.resolve();
      await terminalTransitionStarted.promise;
      await transaction.$queryRaw`
        SELECT pg_sleep(
          GREATEST(
            0,
            EXTRACT(EPOCH FROM (${deadlineAt}::timestamptz - clock_timestamp())) + 0.2
          )
        ) IS NULL AS slept
      `;
    });
    await lockAcquired.promise;
    const [{ before_deadline: beforeDeadline }] = await updater.$queryRaw<
      Array<{ before_deadline: boolean }>
    >`SELECT clock_timestamp() < ${deadlineAt}::timestamptz AS before_deadline`;
    expect(beforeDeadline).toBe(true);
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );
    const reported = repository.transitionActiveAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      runId,
      expectedStatuses: ['running'],
      expectedAttemptToken: attemptToken,
      status: 'succeeded',
      progress: 1,
      result: { outcome: 'partial', imported: 11 },
      finishedAt: new Date(),
      claimedBy: null,
      attemptToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
    });
    terminalTransitionStarted.resolve();

    await lockTransaction;
    await expect(reported).resolves.toBeNull();
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true, result: true, attemptToken: true },
    })).resolves.toEqual({ status: 'running', result: null, attemptToken });
  });

  it('rejects expired-lease, wrong-token, and wrong-tenant browser terminal reports', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    await createBrowserRun(locker, {
      runId,
      attemptToken,
      deadlineAt: new Date(Date.now() + 60_000),
      leaseExpiresAt: new Date(Date.now() - 1_000),
    });
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );
    const transition = (organizationId: string, expectedAttemptToken: string) =>
      repository.transitionActiveAttempt({
        organizationId,
        runId,
        expectedStatuses: ['running'],
        expectedAttemptToken,
        status: 'failed',
        errorCode: 'browser_step_failed',
        errorMessage: 'Browser step failed',
        finishedAt: new Date(),
        claimedBy: null,
        attemptToken: null,
        claimedAt: null,
        leaseExpiresAt: null,
      });

    await expect(transition(TEST_ORGANIZATION_ID, attemptToken)).resolves.toBeNull();
    await locker.operationRun.update({
      where: { id: runId },
      data: { leaseExpiresAt: new Date(Date.now() + 60_000) },
    });
    await expect(transition(TEST_ORGANIZATION_ID, randomUUID())).resolves.toBeNull();
    await expect(transition(OTHER_ORGANIZATION_ID, attemptToken)).resolves.toBeNull();
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true, errorCode: true, attemptToken: true },
    })).resolves.toEqual({ status: 'running', errorCode: null, attemptToken });
  });

  it('does not claim a browser run whose absolute deadline has passed', async () => {
    const runId = randomUUID();
    await locker.operationRun.create({
      data: {
        id: runId,
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'test.browser_claim_deadline',
        definitionVersion: 1,
        ownerDomain: 'operations',
        title: 'Browser claim deadline test',
        engineType: 'browser',
        resourceClass: 'playwright_1688',
        executionTimeoutMs: 10_000,
        status: 'waiting_runtime',
        triggerSource: 'dashboard',
        input: {},
        maxAttempts: 3,
        deadlineAt: new Date(Date.now() - 1_000),
      },
    });
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );

    await expect(repository.claimNextBrowserRun({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      runtimeId: 'office:integration-test',
      now: new Date(),
      leaseExpiresAt: new Date(Date.now() + 60_000),
    })).resolves.toBeNull();
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true, attempts: true, attemptToken: true },
    })).resolves.toEqual({
      status: 'waiting_runtime',
      attempts: 0,
      attemptToken: null,
    });
  });

  it('terminal-cancels a committed claim while preserving its attempt and metadata', async () => {
    const runId = randomUUID();
    const now = new Date();
    const deadlineAt = new Date(now.getTime() + 60_000);
    const scheduledFor = new Date(now.getTime() - 1_000);
    const workerId = 'operations-integration-shutdown';
    await locker.operationRun.create({
      data: {
        id: runId,
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'test.committed_claim_shutdown',
        definitionVersion: 1,
        ownerDomain: 'operations',
        title: 'Committed claim shutdown test',
        engineType: 'server',
        resourceClass: 'default',
        executionTimeoutMs: 10_000,
        status: 'queued',
        triggerSource: 'dashboard',
        input: {},
        attempts: 0,
        maxAttempts: 3,
        deadlineAt,
        scheduledFor,
      },
    });
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );
    const claimed = await repository.claimNextRun({
      resourceClass: 'default',
      workerId,
      now,
      leaseExpiresAt: new Date(now.getTime() + 10_000),
      signal: new AbortController().signal,
    });
    expect(claimed).toMatchObject({
      id: runId,
      status: 'running',
      attempts: 1,
      claimedBy: workerId,
    });

    const finishedAt = new Date(now.getTime() + 500);
    await expect(repository.cancelClaimedAttemptForLifecycle({
      organizationId: TEST_ORGANIZATION_ID,
      runId,
      expectedAttemptToken: claimed?.attemptToken as string,
      claimedBy: workerId,
      errorCode: 'operation_server_shutdown',
      finishedAt,
    })).resolves.toBe(true);

    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: {
        status: true,
        attempts: true,
        claimedBy: true,
        attemptToken: true,
        claimedAt: true,
        leaseExpiresAt: true,
        startedAt: true,
        deadlineAt: true,
        scheduledFor: true,
        errorCode: true,
        errorMessage: true,
        finishedAt: true,
      },
    })).resolves.toEqual({
      status: 'cancelled',
      attempts: 1,
      claimedBy: null,
      attemptToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
      startedAt: now,
      deadlineAt,
      scheduledFor,
      errorCode: 'operation_server_shutdown',
      errorMessage: 'Operation cancelled because the API server is shutting down',
      finishedAt,
    });
  });

  it('does not shutdown-cancel a different tenant, token, worker, or status', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    const workerId = 'operations-integration-shutdown';
    await locker.operationRun.create({
      data: {
        id: runId,
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'test.committed_claim_shutdown_fence',
        definitionVersion: 1,
        ownerDomain: 'operations',
        title: 'Committed claim shutdown fence test',
        engineType: 'server',
        resourceClass: 'default',
        executionTimeoutMs: 10_000,
        status: 'running',
        triggerSource: 'dashboard',
        input: {},
        attempts: 1,
        maxAttempts: 3,
        claimedBy: workerId,
        attemptToken,
        claimedAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + 60_000),
        deadlineAt: new Date(Date.now() + 60_000),
        startedAt: new Date(),
      },
    });
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );
    const cancel = (input: {
      organizationId?: string;
      expectedAttemptToken?: string;
      claimedBy?: string;
    }) => repository.cancelClaimedAttemptForLifecycle({
      organizationId: input.organizationId ?? TEST_ORGANIZATION_ID,
      runId,
      expectedAttemptToken: input.expectedAttemptToken ?? attemptToken,
      claimedBy: input.claimedBy ?? workerId,
      errorCode: 'operation_server_shutdown',
      finishedAt: new Date(),
    });

    await expect(cancel({ organizationId: OTHER_ORGANIZATION_ID }))
      .resolves.toBe(false);
    await expect(cancel({ expectedAttemptToken: randomUUID() }))
      .resolves.toBe(false);
    await expect(cancel({ claimedBy: 'operations-other-worker' }))
      .resolves.toBe(false);
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true, attempts: true, attemptToken: true, claimedBy: true },
    })).resolves.toEqual({
      status: 'running',
      attempts: 1,
      attemptToken,
      claimedBy: workerId,
    });

    await locker.operationRun.update({
      where: { id: runId },
      data: { status: 'succeeded' },
    });
    await expect(cancel({})).resolves.toBe(false);
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true, attempts: true, attemptToken: true, claimedBy: true },
    })).resolves.toEqual({
      status: 'succeeded',
      attempts: 1,
      attemptToken,
      claimedBy: workerId,
    });
  });

  it('terminal-cancels expired server leases, preserves queued work, and never reclaims the lost attempt', async () => {
    const expiredRunId = randomUUID();
    const queuedRunId = randomUUID();
    const liveRunId = randomUUID();
    const expiredAttemptToken = randomUUID();
    const now = new Date();
    const deadlineAt = new Date(now.getTime() + 60_000);
    const scheduledFor = new Date(now.getTime() - 1_000);
    await locker.operationRun.createMany({
      data: [
        {
          id: expiredRunId,
          organizationId: TEST_ORGANIZATION_ID,
          operationKey: 'test.lost_server_worker',
          definitionVersion: 1,
          ownerDomain: 'operations',
          title: 'Lost server worker test',
          engineType: 'server',
          resourceClass: 'default',
          executionTimeoutMs: 10_000,
          status: 'running',
          triggerSource: 'dashboard',
          input: {},
          attempts: 1,
          maxAttempts: 3,
          claimedBy: 'operations-9999',
          attemptToken: expiredAttemptToken,
          claimedAt: new Date(now.getTime() - 20_000),
          leaseExpiresAt: new Date(now.getTime() - 1_000),
          deadlineAt,
          scheduledFor,
          startedAt: new Date(now.getTime() - 20_000),
        },
        {
          id: queuedRunId,
          organizationId: TEST_ORGANIZATION_ID,
          operationKey: 'test.unclaimed_queued_survives',
          definitionVersion: 1,
          ownerDomain: 'operations',
          title: 'Unclaimed queued work survives',
          engineType: 'server',
          resourceClass: 'naver_api',
          executionTimeoutMs: 10_000,
          status: 'queued',
          triggerSource: 'dashboard',
          input: {},
          attempts: 0,
          maxAttempts: 3,
          scheduledFor,
        },
        {
          id: liveRunId,
          organizationId: TEST_ORGANIZATION_ID,
          operationKey: 'test.live_server_worker',
          definitionVersion: 1,
          ownerDomain: 'operations',
          title: 'Live server worker test',
          engineType: 'server',
          resourceClass: 'snapshot_compute',
          executionTimeoutMs: 10_000,
          status: 'running',
          triggerSource: 'dashboard',
          input: {},
          attempts: 1,
          maxAttempts: 3,
          claimedBy: 'operations-8888',
          attemptToken: randomUUID(),
          claimedAt: now,
          leaseExpiresAt: new Date(now.getTime() + 60_000),
          deadlineAt,
          startedAt: now,
        },
      ],
    });
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );

    await expect(repository.cancelExpiredWorkerAttempts({ now, limit: 10 }))
      .resolves.toBe(1);
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: expiredRunId },
      select: {
        status: true,
        attempts: true,
        attemptToken: true,
        claimedBy: true,
        leaseExpiresAt: true,
        deadlineAt: true,
        scheduledFor: true,
        errorCode: true,
      },
    })).resolves.toEqual({
      status: 'cancelled',
      attempts: 1,
      attemptToken: null,
      claimedBy: null,
      leaseExpiresAt: null,
      deadlineAt,
      scheduledFor,
      errorCode: 'operation_worker_lost',
    });
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: queuedRunId },
      select: { status: true, attempts: true },
    })).resolves.toEqual({ status: 'queued', attempts: 0 });
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: liveRunId },
      select: { status: true, attempts: true },
    })).resolves.toEqual({ status: 'running', attempts: 1 });

    const claimed = await repository.claimNextRun({
      resourceClass: 'default',
      workerId: 'operations-new-worker',
      now,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      signal: new AbortController().signal,
    });
    expect(claimed).toBeNull();
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: expiredRunId },
      select: { status: true, attempts: true },
    })).resolves.toEqual({ status: 'cancelled', attempts: 1 });
  });
});

async function createBrowserRun(
  prisma: PrismaClient,
  input: {
    runId: string;
    attemptToken: string;
    deadlineAt: Date;
    leaseExpiresAt: Date;
  },
): Promise<void> {
  await prisma.operationRun.create({
    data: {
      id: input.runId,
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: 'test.browser_terminal_fence',
      definitionVersion: 1,
      ownerDomain: 'operations',
      title: 'Browser terminal fence test',
      engineType: 'browser',
      resourceClass: 'playwright_1688',
      executionTimeoutMs: 10_000,
      status: 'running',
      triggerSource: 'dashboard',
      input: {},
      attempts: 1,
      maxAttempts: 3,
      claimedBy: 'office:integration-test',
      attemptToken: input.attemptToken,
      claimedAt: new Date(),
      leaseExpiresAt: input.leaseExpiresAt,
      deadlineAt: input.deadlineAt,
      startedAt: new Date(),
    },
  });
}
