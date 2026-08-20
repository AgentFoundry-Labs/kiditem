import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../../../test-helpers/real-prisma';
import { OperationRepositoryAdapter } from '../operation.repository.adapter';
import { OperationAttemptVerifierService } from '../../../../application/service/operation-attempt-verifier.service';
import { OperationLifecycleGateService } from '../../../../application/service/operation-lifecycle-gate.service';

const OPERATION_KEY = 'sourcing.collect_wing_catalog_batch';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('active browser attempt transactional fence (PG integration)', () => {
  let primary: PrismaClient;
  let contender: PrismaClient;
  let repository: OperationRepositoryAdapter;
  let verifier: OperationAttemptVerifierService;

  beforeAll(async () => {
    primary = makeTestPrisma();
    contender = makeTestPrisma();
    await Promise.all([primary.$connect(), contender.$connect()]);
    repository = new OperationRepositoryAdapter(
      primary as unknown as PrismaService,
    );
    const gate = new OperationLifecycleGateService();
    gate.open();
    verifier = new OperationAttemptVerifierService(repository, gate);
  });

  afterAll(async () => Promise.all([
    primary.$disconnect(),
    contender.$disconnect(),
  ]));

  beforeEach(async () => {
    await resetDb(primary);
    await seedBaseFixture(primary);
  });

  it('holds the Operation row lock through the owner write transaction', async () => {
    const attempt = await createActiveAttempt(primary);
    const locked = deferred();
    const release = deferred();
    const fence = transactionalFence(verifier, attempt, async (tx) => {
      locked.resolve();
      await release.promise;
      await tx.sourcingEvidenceIngestionRun.create({
        data: ingestionRunData(attempt.runId),
      });
      return 'published';
    });
    await locked.promise;

    let cancellationSettled = false;
    const cancellation = contender.operationRun.update({
      where: { id: attempt.runId },
      data: {
        status: 'cancelled',
        attemptToken: null,
        leaseExpiresAt: null,
        finishedAt: new Date(),
      },
    }).finally(() => {
      cancellationSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(cancellationSettled).toBe(false);

    release.resolve();
    await expect(fence).resolves.toBe('published');
    await cancellation;
    await expect(primary.sourcingEvidenceIngestionRun.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(1);
  });

  it('uses a post-lock database clock and rejects cancellation or deadline loss before publication', async () => {
    const attempt = await createActiveAttempt(primary);
    const acquired = deferred();
    const release = deferred();
    const blocker = contender.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM operation_runs
        WHERE id = ${attempt.runId}::uuid
        FOR UPDATE
      `;
      await tx.operationRun.update({
        where: { id: attempt.runId },
        data: { deadlineAt: new Date(Date.now() - 1_000) },
      });
      acquired.resolve();
      await release.promise;
    });
    await acquired.promise;

    let callbackCalls = 0;
    const fenced = transactionalFence(verifier, attempt, async (tx) => {
      callbackCalls += 1;
      await tx.sourcingEvidenceIngestionRun.create({
        data: ingestionRunData(attempt.runId),
      });
    });
    release.resolve();
    await blocker;

    await expect(fenced).rejects.toBeInstanceOf(ConflictException);
    expect(callbackCalls).toBe(0);
    await expect(primary.sourcingEvidenceIngestionRun.count()).resolves.toBe(0);
  });

  it.each([
    ['organizationId', randomUUID()],
    ['expectedOperationKey', 'sourcing.wrong_operation'],
    ['attemptToken', randomUUID()],
  ] as const)('rejects a wrong %s under the row lock', async (key, value) => {
    const attempt = await createActiveAttempt(primary);
    await expect(transactionalFence(verifier, {
      ...attempt,
      [key]: value,
    }, async () => 'never')).rejects.toBeInstanceOf(ConflictException);
  });
});

function transactionalFence<T>(
  verifier: OperationAttemptVerifierService,
  input: {
    organizationId: string;
    runId: string;
    expectedOperationKey: string;
    attemptToken: string;
  },
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return verifier.withActiveBrowserAttemptFence(
    input,
    (_attempt, tx) => operation(tx as unknown as Prisma.TransactionClient),
  );
}

async function createActiveAttempt(prisma: PrismaClient) {
  const runId = randomUUID();
  const attemptToken = randomUUID();
  await prisma.operationRun.create({
    data: {
      id: runId,
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: OPERATION_KEY,
      definitionVersion: 1,
      ownerDomain: 'sourcing',
      title: 'Wing catalog pilot',
      engineType: 'browser',
      resourceClass: 'extension_coupang',
      executionTimeoutMs: 15 * 60_000,
      status: 'running',
      triggerSource: 'dashboard',
      requestedByUserId: TEST_USER_ID,
      input: {
        keywords: ['A'],
        maxPages: 1,
        purpose: 'catalog_search',
      },
      attempts: 1,
      maxAttempts: 3,
      claimedBy: 'kiditem-os-test',
      attemptToken,
      claimedAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + 60_000),
      deadlineAt: new Date(Date.now() + 15 * 60_000),
      startedAt: new Date(),
    },
  });
  return {
    organizationId: TEST_ORGANIZATION_ID,
    runId,
    expectedOperationKey: OPERATION_KEY,
    attemptToken,
  };
}

function ingestionRunData(operationRunId: string) {
  const now = new Date();
  return {
    organizationId: TEST_ORGANIZATION_ID,
    sourceKey: 'coupang.wing_catalog',
    scopeKey: 'default',
    targetKey: `atomic:${operationRunId}`,
    idempotencyKey: `atomic:${operationRunId}`,
    requestHash: operationRunId.replaceAll('-', '').padEnd(64, '0').slice(0, 64),
    collectorKey: 'wing-catalog-observation-ingest',
    collectorVersion: 'test',
    triggerKind: 'extension',
    triggeredByUserId: TEST_USER_ID,
    status: 'complete',
    leaseExpiresAt: now,
    sourceControlCheckedAt: now,
    generation: 1,
    startedAt: now,
    completedAt: now,
    coverageNumerator: 0,
    qualityReport: {},
  } as const;
}
