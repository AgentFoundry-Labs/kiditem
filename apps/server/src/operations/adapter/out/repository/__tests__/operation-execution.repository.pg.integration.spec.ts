import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { transitionActiveServerAttempt } from '../operation-execution.repository';
import {
  makeTestPrisma,
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
});
