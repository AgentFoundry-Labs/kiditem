import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import { OperationRepositoryAdapter } from '../operation.repository.adapter';

describe('OperationRepositoryAdapter database-time delayed retries', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('uses PostgreSQL time for the delay and preserves exact-token compare-and-swap', async () => {
    const runId = randomUUID();
    const attemptToken = randomUUID();
    const wrongToken = randomUUID();
    const repository = new OperationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    await prisma.operationRun.create({
      data: {
        id: runId,
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'test.retry.database-time',
        definitionVersion: 1,
        ownerDomain: 'operations',
        title: 'Database-time retry test',
        engineType: 'server',
        resourceClass: 'default',
        executionTimeoutMs: 60_000,
        status: 'running',
        triggerSource: 'system',
        input: {},
        attempts: 1,
        maxAttempts: 3,
        claimedBy: 'operations:integration-test',
        attemptToken,
        claimedAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + 60_000),
        deadlineAt: new Date(Date.now() + 60_000),
        startedAt: new Date(),
      },
    });

    await expect(repository.requeueActiveAttemptAfter({
      organizationId: TEST_ORGANIZATION_ID,
      runId,
      expectedAttemptToken: wrongToken,
      delayMs: 250,
      errorCode: 'STORAGE_DELETE_UNKNOWN',
      errorMessage: 'Deletion storage state is unknown',
    })).resolves.toBeNull();
    await expect(prisma.operationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { status: true, attemptToken: true },
    })).resolves.toEqual({ status: 'running', attemptToken });

    const requeued = await repository.requeueActiveAttemptAfter({
      organizationId: TEST_ORGANIZATION_ID,
      runId,
      expectedAttemptToken: attemptToken,
      delayMs: 250,
      errorCode: 'STORAGE_DELETE_UNKNOWN',
      errorMessage: 'Deletion storage state is unknown',
    });
    expect(requeued).toMatchObject({ status: 'queued', attemptToken: null });
    expect(requeued?.scheduledFor).toBeInstanceOf(Date);

    const processClockFarAhead = new Date('2099-01-01T00:00:00.000Z');
    await expect(repository.claimNextRun({
      resourceClass: 'default',
      workerId: 'operations:integration-test',
      now: processClockFarAhead,
      leaseExpiresAt: new Date(processClockFarAhead.getTime() + 60_000),
      signal: new AbortController().signal,
    })).resolves.toBeNull();

    await prisma.$queryRaw`SELECT pg_sleep(0.3) IS NULL AS slept`;

    await expect(repository.claimNextRun({
      resourceClass: 'default',
      workerId: 'operations:integration-test',
      now: processClockFarAhead,
      leaseExpiresAt: new Date(processClockFarAhead.getTime() + 60_000),
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ id: runId, status: 'running' });
  });
});
