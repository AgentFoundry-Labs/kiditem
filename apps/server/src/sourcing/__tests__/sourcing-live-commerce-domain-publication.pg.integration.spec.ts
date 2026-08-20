import { createHash, randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { OperationRepositoryAdapter } from '../../operations/adapter/out/repository/operation.repository.adapter';
import { OperationAttemptVerifierService } from '../../operations/application/service/operation-attempt-verifier.service';
import { OperationLifecycleGateService } from '../../operations/application/service/operation-lifecycle-gate.service';
import { SourcingCollectionRepositoryAdapter } from '../adapter/out/repository/sourcing-collection.repository.adapter';
import { mapTrendTypedRecordsToAuthorizedOutput } from '../application/service/sourcing-collection-mappers';
import type { SourcingCollectionPermit } from '../application/port/out/repository/sourcing-collection.repository.port';

const OPERATION_KEY = 'sourcing.collect_taobao_live';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('Taobao domain Operation publication fence (PG integration)', () => {
  let primary: PrismaClient;
  let contender: PrismaClient;
  let verifier: OperationAttemptVerifierService;
  let collections: SourcingCollectionRepositoryAdapter;

  beforeAll(async () => {
    primary = makeTestPrisma();
    contender = makeTestPrisma();
    await Promise.all([primary.$connect(), contender.$connect()]);
    const operations = new OperationRepositoryAdapter(
      primary as unknown as PrismaService,
    );
    const gate = new OperationLifecycleGateService();
    gate.open();
    verifier = new OperationAttemptVerifierService(operations, gate);
    collections = new SourcingCollectionRepositoryAdapter(
      primary as unknown as PrismaService,
    );
  });

  afterAll(async () => Promise.all([
    primary.$disconnect(),
    contender.$disconnect(),
  ]));

  beforeEach(async () => {
    await resetDb(primary);
    await seedBaseFixture(primary);
  });

  it.each([
    {
      name: 'cancellation',
      loseFence: (tx: PrismaClient, runId: string) => tx.operationRun.update({
        where: { id: runId },
        data: {
          status: 'cancelled',
          attemptToken: null,
          leaseExpiresAt: null,
          finishedAt: new Date(),
        },
      }),
    },
    {
      name: 'deadline expiry',
      loseFence: (tx: PrismaClient, runId: string) => tx.operationRun.update({
        where: { id: runId },
        data: { deadlineAt: new Date(Date.now() - 1_000) },
      }),
    },
  ])('does not publish canonical snapshots when $name wins after provider completion', async ({ loseFence }) => {
    const attempt = await createActiveDomainAttempt(primary);
    const permit = await claimTaobaoCollection(collections, attempt.runId);
    const operationRowLocked = deferred();
    const release = deferred();
    const fenceLoss = contender.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id FROM operation_runs
        WHERE id = ${attempt.runId}::uuid
          AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
        FOR UPDATE
      `;
      await loseFence(transaction, attempt.runId);
      operationRowLocked.resolve();
      await release.promise;
    });
    await operationRowLocked.promise;

    let commitCallbackCalls = 0;
    const publication = verifier.withActiveDomainAttemptFence(
      fenceInput(attempt),
      async (_active, transaction) => {
        commitCallbackCalls += 1;
        return collections.commitInAttempt(transaction, {
          permit,
          output: taobaoOutput(permit),
        });
      },
    );
    release.resolve();
    await fenceLoss;

    await expect(publication).rejects.toBeInstanceOf(ConflictException);
    expect(commitCallbackCalls).toBe(0);
    await expect(primary.liveCommerceBroadcastDailySnapshot.count()).resolves.toBe(0);
    await expect(primary.liveCommerceProductDailySnapshot.count()).resolves.toBe(0);
  });
});

async function createActiveDomainAttempt(prisma: PrismaClient) {
  const runId = randomUUID();
  const attemptToken = randomUUID();
  await prisma.operationRun.create({
    data: {
      id: runId,
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: OPERATION_KEY,
      definitionVersion: 1,
      ownerDomain: 'sourcing',
      title: 'Taobao live collection',
      engineType: 'domain',
      resourceClass: 'snapshot_compute',
      executionTimeoutMs: 15 * 60_000,
      status: 'running',
      triggerSource: 'dashboard',
      requestedByUserId: TEST_USER_ID,
      input: { queryDate: '20260814', liveIds: ['live-1'] },
      attempts: 1,
      maxAttempts: 3,
      claimedBy: 'kiditem-api-test',
      attemptToken,
      claimedAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + 60_000),
      deadlineAt: new Date(Date.now() + 15 * 60_000),
      startedAt: new Date(),
    },
  });
  return { organizationId: TEST_ORGANIZATION_ID, runId, attemptToken };
}

function fenceInput(attempt: Awaited<ReturnType<typeof createActiveDomainAttempt>>) {
  return { ...attempt, expectedOperationKey: OPERATION_KEY };
}

async function claimTaobaoCollection(
  collections: SourcingCollectionRepositoryAdapter,
  operationRunId: string,
): Promise<SourcingCollectionPermit> {
  const idempotencyKey = `taobao-operation:${operationRunId}`;
  const claim = await collections.claimAuthorizedRun({
    organizationId: TEST_ORGANIZATION_ID,
    sourceKey: 'taobao.live_commerce',
    scopeKey: 'default',
    targetKey: `operation:${operationRunId}`,
    idempotencyKey,
    requestHash: sha256(idempotencyKey),
    collectorKey: 'taobao-live-operation',
    collectorVersion: 'test',
    triggerKind: 'manual',
    triggeredByUserId: TEST_USER_ID,
    leaseDurationMs: 60_000,
  });
  if (claim.kind !== 'claimed') {
    throw new Error(`Expected Taobao collection claim, received ${claim.kind}`);
  }
  return claim.permit;
}

function taobaoOutput(permit: SourcingCollectionPermit) {
  const capturedAt = new Date('2026-08-14T08:00:00.000Z');
  const businessDate = new Date('2026-08-14T00:00:00.000Z');
  return mapTrendTypedRecordsToAuthorizedOutput({
    permit,
    typedRecords: [
      {
        kind: 'live_commerce_broadcast',
        row: {
          organizationId: TEST_ORGANIZATION_ID,
          businessDate,
          source: 'taobao',
          broadcastId: 'live-1',
          title: 'Kids live',
          broadcasterId: 'seller-1',
          broadcasterName: 'Kids seller',
          status: 'live',
          viewerCount: 100,
          likeCount: 10,
          startedAt: null,
          endedAt: null,
          coverImageUrl: null,
          sourceUrl: 'https://taobao.example/live-1',
          capturedAt,
        },
      },
      {
        kind: 'live_commerce_product',
        row: {
          organizationId: TEST_ORGANIZATION_ID,
          businessDate,
          source: 'taobao',
          broadcastId: 'live-1',
          productId: 'product-1',
          rank: 1,
          title: 'Kids product',
          priceCny: 12.5,
          salesCount: 10,
          imageUrl: null,
          sourceUrl: 'https://taobao.example/product-1',
          capturedAt,
        },
      },
    ],
    qualityReport: { fixture: 'taobao-domain-fence' },
  });
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
