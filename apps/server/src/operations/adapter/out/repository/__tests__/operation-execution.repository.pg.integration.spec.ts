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
