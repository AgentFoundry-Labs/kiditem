import { createHash, randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { OperationRepositoryAdapter } from '../../operations/adapter/out/repository/operation.repository.adapter';
import { OperationAttemptVerifierService } from '../../operations/application/service/operation-attempt-verifier.service';
import { OperationLifecycleGateService } from '../../operations/application/service/operation-lifecycle-gate.service';
import { SourcingCollectionRepositoryAdapter } from '../adapter/out/repository/sourcing-collection.repository.adapter';
import { map1688HotProductsToAuthorizedOutput } from '../application/service/sourcing-collection-mappers';
import type { SourcingCollectionPermit } from '../application/port/out/repository/sourcing-collection.repository.port';

const OPERATION_KEY = 'sourcing.search_1688_keyword_batch';

describe('1688 keyword domain Operation publication fence (PG integration)', () => {
  let primary: PrismaClient;
  let contender: PrismaClient;
  let verifier: OperationAttemptVerifierService;
  let collections: SourcingCollectionRepositoryAdapter;

  beforeAll(async () => {
    primary = makeTestPrisma();
    contender = makeTestPrisma();
    await Promise.all([primary.$connect(), contender.$connect()]);
    const operations = new OperationRepositoryAdapter(primary as unknown as PrismaService);
    const gate = new OperationLifecycleGateService();
    gate.open();
    verifier = new OperationAttemptVerifierService(operations, gate);
    collections = new SourcingCollectionRepositoryAdapter(primary as unknown as PrismaService);
  });

  afterAll(async () => Promise.all([primary.$disconnect(), contender.$disconnect()]));

  beforeEach(async () => {
    await resetDb(primary);
    await seedBaseFixture(primary);
  });

  it.each([
    {
      name: 'cancellation after provider completion',
      fence: (attempt: Attempt) => exactFence(attempt),
      loseFence: (tx: PrismaClient, runId: string) => tx.operationRun.update({
        where: { id: runId },
        data: { status: 'cancelled', attemptToken: null, leaseExpiresAt: null, finishedAt: new Date() },
      }),
    },
    {
      name: 'deadline expiry after provider completion',
      fence: (attempt: Attempt) => exactFence(attempt),
      loseFence: (tx: PrismaClient, runId: string) => tx.operationRun.update({
        where: { id: runId },
        data: { deadlineAt: new Date(Date.now() - 1_000) },
      }),
    },
    {
      name: 'wrong organization after provider completion',
      fence: (attempt: Attempt) => ({ ...exactFence(attempt), organizationId: OTHER_ORGANIZATION_ID }),
    },
    {
      name: 'wrong operation key after provider completion',
      fence: (attempt: Attempt) => ({ ...exactFence(attempt), expectedOperationKey: 'sourcing.collect_1688_trends' }),
    },
    {
      name: 'wrong attempt token after provider completion',
      fence: (attempt: Attempt) => ({ ...exactFence(attempt), attemptToken: randomUUID() }),
    },
  ])('does not enter the canonical callback for $name', async ({ fence, loseFence }) => {
    const attempt = await createAttempt(primary);
    const permit = await claimCollection(collections, attempt.runId);
    let providerCompleted = false;
    providerCompleted = true;
    expect(providerCompleted).toBe(true);

    if (loseFence) await contender.$transaction((transaction) => loseFence(transaction, attempt.runId));

    let callbackCalls = 0;
    await expect(verifier.withActiveDomainAttemptFence(fence(attempt), async (_active, transaction) => {
      callbackCalls += 1;
      return collections.commitInAttempt(transaction, { permit, output: keywordOutput(permit) });
    })).rejects.toBeInstanceOf(ConflictException);

    expect(callbackCalls).toBe(0);
    await expect(primary.sourcing1688OfferKeywordObservation.count()).resolves.toBe(0);
  });

  it('commits the keyword observation with the exact active organization, key, and token', async () => {
    const attempt = await createAttempt(primary);
    const permit = await claimCollection(collections, attempt.runId);

    await expect(verifier.withActiveDomainAttemptFence(exactFence(attempt), async (_active, transaction) =>
      collections.commitInAttempt(transaction, { permit, output: keywordOutput(permit) }),
    )).resolves.toMatchObject({ kind: 'committed', acceptedCount: 1 });

    await expect(primary.sourcing1688OfferKeywordObservation.count()).resolves.toBe(1);
  });
});

interface Attempt {
  organizationId: string;
  runId: string;
  attemptToken: string;
}

async function createAttempt(prisma: PrismaClient): Promise<Attempt> {
  const runId = randomUUID();
  const attemptToken = randomUUID();
  await prisma.operationRun.create({
    data: {
      id: runId,
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: OPERATION_KEY,
      definitionVersion: 2,
      ownerDomain: 'sourcing',
      title: '1688 keyword search',
      engineType: 'domain',
      resourceClass: 'playwright_1688',
      executionTimeoutMs: 15 * 60_000,
      status: 'running',
      triggerSource: 'dashboard',
      requestedByUserId: TEST_USER_ID,
      input: { keywords: ['儿童笔袋'] },
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

function exactFence(attempt: Attempt) {
  return { ...attempt, expectedOperationKey: OPERATION_KEY };
}

async function claimCollection(
  collections: SourcingCollectionRepositoryAdapter,
  operationRunId: string,
): Promise<SourcingCollectionPermit> {
  const idempotencyKey = `1688-keyword-operation:${operationRunId}:children-bag`;
  const claim = await collections.claimAuthorizedRun({
    organizationId: TEST_ORGANIZATION_ID,
    sourceKey: '1688.hot_product',
    scopeKey: 'default',
    targetKey: '儿童笔袋',
    idempotencyKey,
    requestHash: sha256(idempotencyKey),
    collectorKey: 'operation-1688-keyword-search',
    collectorVersion: 'sourcing-1688-search-result/v1',
    triggerKind: 'manual',
    triggeredByUserId: TEST_USER_ID,
    leaseDurationMs: 60_000,
  });
  if (claim.kind !== 'claimed') throw new Error(`Expected claimed collection run, received ${claim.kind}`);
  return claim.permit;
}

function keywordOutput(permit: SourcingCollectionPermit) {
  const capturedAt = new Date('2026-08-20T08:00:00.000Z');
  return map1688HotProductsToAuthorizedOutput({
    permit,
    rows: [{
      organizationId: TEST_ORGANIZATION_ID,
      businessDate: new Date('2026-08-20T00:00:00.000Z'),
      offerId: 'offer-1',
      sourceKeyword: '儿童笔袋',
      rank: 1,
      title: 'Kids bag',
      priceCny: 12.5,
      monthlySales: 10,
      repurchaseRate: null,
      tradeScore: null,
      supplierName: null,
      imageUrl: null,
      sourceUrl: 'https://detail.1688.com/offer/1.html',
      capturedAt,
      searchMetadata: { score: 88 },
    }],
    qualityReport: { fixture: '1688-keyword-domain-fence' },
  });
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
