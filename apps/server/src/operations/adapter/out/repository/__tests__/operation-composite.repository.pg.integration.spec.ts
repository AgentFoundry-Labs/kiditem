import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import type { CreateOperationRunRecord } from '../../../../application/port/out/repository/operation.repository.port';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import { OperationRepositoryAdapter } from '../operation.repository.adapter';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('operation composite repository PostgreSQL fencing', () => {
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

  it.each([
    'stale token',
    'expired lease',
    'expired deadline',
    'tenant mismatch',
  ] as const)('creates zero child rows for %s parent fence loss', async (scenario) => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    await createRunningParent(locker, {
      runId,
      attemptToken,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      deadlineAt: new Date(Date.now() + 60_000),
    });
    if (scenario === 'expired lease') {
      await locker.operationRun.update({
        where: { id: runId },
        data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
      });
    }
    if (scenario === 'expired deadline') {
      await locker.operationRun.update({
        where: { id: runId },
        data: { deadlineAt: new Date(Date.now() - 1_000) },
      });
    }
    const organizationId = scenario === 'tenant mismatch'
      ? OTHER_ORGANIZATION_ID
      : TEST_ORGANIZATION_ID;
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );

    await expect(repository.createChildAndWaitForDependency({
      parentOrganizationId: organizationId,
      parentRunId: runId,
      expectedAttemptToken: scenario === 'stale token'
        ? randomUUID()
        : attemptToken,
      child: childInput(organizationId, runId),
    })).resolves.toBeNull();
    await expect(locker.operationRun.count({
      where: { parentRunId: runId },
    })).resolves.toBe(0);
  });

  it('creates zero child rows when its parent lock is released after the deadline', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    const [{ deadline_at: deadlineAt }] = await locker.$queryRaw<
      Array<{ deadline_at: Date }>
    >`SELECT clock_timestamp() + interval '2 seconds' AS deadline_at`;
    await createRunningParent(locker, {
      runId,
      attemptToken,
      leaseExpiresAt: new Date(deadlineAt.getTime() + 10_000),
      deadlineAt,
    });
    const lockAcquired = deferred();
    const childRequestStarted = deferred();
    const lockTransaction = locker.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM operation_runs
        WHERE id = ${runId}::uuid
        FOR UPDATE
      `;
      lockAcquired.resolve();
      await childRequestStarted.promise;
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
    const child = repository.createChildAndWaitForDependency({
      parentOrganizationId: TEST_ORGANIZATION_ID,
      parentRunId: runId,
      expectedAttemptToken: attemptToken,
      child: childInput(TEST_ORGANIZATION_ID, runId),
    });
    childRequestStarted.resolve();

    await lockTransaction;
    await expect(child).resolves.toBeNull();
    await expect(locker.operationRun.count({
      where: { parentRunId: runId },
    })).resolves.toBe(0);
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true, attemptToken: true },
    })).resolves.toEqual({ status: 'running', attemptToken });
  });

  it('keeps repeated valid child requests idempotent', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    await createRunningParent(locker, {
      runId,
      attemptToken,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      deadlineAt: new Date(Date.now() + 60_000),
    });
    const repository = new OperationRepositoryAdapter(
      updater as unknown as PrismaService,
    );
    const request = {
      parentOrganizationId: TEST_ORGANIZATION_ID,
      parentRunId: runId,
      expectedAttemptToken: attemptToken,
      child: childInput(TEST_ORGANIZATION_ID, runId),
    };

    const results = await Promise.all([
      repository.createChildAndWaitForDependency(request),
      repository.createChildAndWaitForDependency(request),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    await expect(locker.operationRun.count({
      where: { parentRunId: runId },
    })).resolves.toBe(1);
    await expect(locker.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true, attemptToken: true },
    })).resolves.toEqual({ status: 'waiting_dependency', attemptToken: null });
  });
});

async function createRunningParent(
  prisma: PrismaClient,
  input: {
    runId: string;
    attemptToken: string;
    leaseExpiresAt: Date;
    deadlineAt: Date;
  },
): Promise<void> {
  await prisma.operationRun.create({
    data: {
      id: input.runId,
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: 'test.composite_parent_fence',
      definitionVersion: 1,
      ownerDomain: 'operations',
      title: 'Composite parent fence test',
      engineType: 'composite',
      resourceClass: 'default',
      executionTimeoutMs: 10_000,
      status: 'running',
      triggerSource: 'dashboard',
      input: {},
      attempts: 1,
      maxAttempts: 3,
      claimedBy: 'operations:integration-test',
      attemptToken: input.attemptToken,
      claimedAt: new Date(),
      leaseExpiresAt: input.leaseExpiresAt,
      deadlineAt: input.deadlineAt,
      startedAt: new Date(),
    },
  });
}

function childInput(
  organizationId: string,
  parentRunId: string,
): CreateOperationRunRecord {
  return {
    organizationId,
    operationKey: 'test.composite_child',
    definitionVersion: 1,
    ownerDomain: 'operations',
    title: 'Composite child fence test',
    engineType: 'server',
    resourceClass: 'default',
    executionTimeoutMs: 10_000,
    triggerSource: 'dashboard',
    requestedByUserId: null,
    parentRunId,
    scheduleId: null,
    idempotencyKey: `child:${parentRunId}`,
    input: {},
    maxAttempts: 3,
    scheduledFor: null,
  };
}
