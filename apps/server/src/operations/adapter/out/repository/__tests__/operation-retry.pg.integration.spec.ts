import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import { OperationRepositoryAdapter } from '../operation.repository.adapter';
import { OperationAttemptExecutorService } from '../../../../application/service/operation-attempt-executor.service';
import { CompositeOperationCoordinatorService } from '../../../../application/service/composite-operation-coordinator.service';
import { OperationDispatcherService } from '../../../../application/service/operation-dispatcher.service';
import { OperationHandlerRegistryService } from '../../../../application/service/operation-handler-registry.service';
import { OperationLifecycleGateService } from '../../../../application/service/operation-lifecycle-gate.service';
import { OperationRunWorkerService } from '../../../../application/service/operation-run-worker.service';

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
    expect(requeued).toMatchObject({
      status: 'queued',
      attemptToken: null,
      deadlineAt: null,
    });
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

    const claimed = await repository.claimNextRun({
      resourceClass: 'default',
      workerId: 'operations:integration-test',
      now: processClockFarAhead,
      leaseExpiresAt: new Date(processClockFarAhead.getTime() + 60_000),
      signal: new AbortController().signal,
    });
    expect(claimed).toMatchObject({ id: runId, status: 'running' });
    expect(claimed?.deadlineAt).toBeInstanceOf(Date);
    expect(claimed?.deadlineAt?.getTime()).toBeLessThan(
      processClockFarAhead.getTime(),
    );
  });

  it('applies code-owned ephemeral exclusions before the public list limit', async () => {
    const repository = new OperationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const newest = new Date('2026-08-22T07:00:00.000Z');
    await prisma.operationRun.createMany({
      data: Array.from({ length: 100 }, (_, index) => ({
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'agent-os.session.delete',
        definitionVersion: 1,
        ownerDomain: 'agent-os',
        title: `Ephemeral ${index}`,
        engineType: 'server',
        resourceClass: 'default',
        executionTimeoutMs: 60_000,
        status: 'succeeded',
        triggerSource: 'system',
        input: {},
        createdAt: new Date(newest.getTime() + index),
      })),
    });
    await prisma.operationRun.createMany({
      data: Array.from({ length: 3 }, (_, index) => ({
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: `retained.operation.${index}`,
        definitionVersion: 1,
        ownerDomain: 'operations',
        title: `Retained ${index}`,
        engineType: 'server',
        resourceClass: 'default',
        executionTimeoutMs: 60_000,
        status: 'succeeded',
        triggerSource: 'system',
        input: {},
        createdAt: new Date(newest.getTime() - index - 1),
      })),
    });

    await expect(repository.listRuns({
      organizationId: TEST_ORGANIZATION_ID,
      limit: 3,
      excludedOperationKeys: ['agent-os.session.delete'],
    })).resolves.toMatchObject([
      { operationKey: 'retained.operation.0' },
      { operationKey: 'retained.operation.1' },
      { operationKey: 'retained.operation.2' },
    ]);
  });

  it('uses database-time retry scheduling for five worker claims and refreshes every attempt deadline', async () => {
    const repository = new OperationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const registry = new OperationHandlerRegistryService();
    const gate = new OperationLifecycleGateService();
    gate.open();
    const coordinator = new CompositeOperationCoordinatorService(
      registry,
      repository,
      gate,
    );
    const seenAttempts: number[] = [];
    registry.register({
      key: 'test.retry.worker-db-time',
      version: 1,
      title: 'Worker DB-time retry test',
      ownerDomain: 'operations',
      engineType: 'server',
      allowedTriggers: ['system'],
      scheduleSupported: false,
      maxAttempts: 5,
      resourceClass: 'default',
      executionTimeoutMs: 60_000,
      inputSchema: z.object({}).strict(),
    }, {
      execute: async (context) => {
        seenAttempts.push(context.attempts);
        const running = await prisma.operationRun.findUniqueOrThrow({
          where: { id: context.runId },
          select: { deadlineAt: true },
        });
        expect(running.deadlineAt).toBeInstanceOf(Date);
        return {
          kind: 'retryable',
          code: 'retryable_worker_fault',
          message: 'Retryable worker fault',
          retryAfterMs: 1,
        };
      },
      exhaustRetry: async (context, failure) => {
        await repository.transitionActiveAttempt({
          organizationId: context.organizationId,
          runId: context.runId,
          expectedStatuses: ['running'],
          expectedAttemptToken: context.attemptToken,
          status: 'failed',
          errorCode: failure.code,
          errorMessage: failure.message,
          finishedAt: new Date(),
          claimedBy: null,
          attemptToken: null,
          claimedAt: null,
          leaseExpiresAt: null,
        });
      },
    });
    const dispatcher = new OperationDispatcherService(
      registry,
      repository,
      coordinator,
    );
    const worker = new OperationRunWorkerService(
      new OperationAttemptExecutorService(dispatcher, repository, registry),
      repository,
      coordinator,
      gate,
    );
    const run = await repository.createRun({
      signal: new AbortController().signal,
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: 'test.retry.worker-db-time',
      definitionVersion: 1,
      ownerDomain: 'operations',
      title: 'Worker DB-time retry test',
      engineType: 'server',
      resourceClass: 'default',
      executionTimeoutMs: 60_000,
      maxAttempts: 5,
      triggerSource: 'system',
      input: {},
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await worker.tick();
      await worker.drainUntil(Date.now() + 5_000, true);
      const persisted = await prisma.operationRun.findUniqueOrThrow({
        where: { id: run.id },
        select: { status: true, attempts: true, deadlineAt: true },
      });
      if (attempt < 4) {
        expect(persisted).toMatchObject({
          status: 'queued',
          attempts: attempt + 1,
          deadlineAt: null,
        });
        await prisma.$queryRaw`SELECT pg_sleep(0.01) IS NULL AS slept`;
      } else {
        expect(persisted).toMatchObject({
          status: 'failed',
          attempts: 5,
        });
      }
    }
    expect(seenAttempts).toEqual([1, 2, 3, 4, 5]);
  });
});
