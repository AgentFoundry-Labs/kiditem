import { createHash, randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import type { ActiveOperationAttemptTransaction } from '../../operations/application/port/active-browser-attempt-transaction';
import { OperationAttemptVerifierService } from '../../operations/application/service/operation-attempt-verifier.service';
import { OperationLifecycleGateService } from '../../operations/application/service/operation-lifecycle-gate.service';
import { SourcingCollectionRepositoryAdapter } from '../adapter/out/repository/sourcing-collection.repository.adapter';
import { Sourcing1688SearchResultRepositoryAdapter } from '../adapter/out/repository/sourcing-1688-search-result.repository.adapter';
import {
  Sourcing1688KeywordProviderError,
  type Search1688KeywordSession,
} from '../application/port/out/provider/1688-keyword-search.port';
import type { Sourcing1688ImageSearchPort } from '../application/port/out/provider/1688-image-search.port';
import { SourcingCollectionCoordinator } from '../application/service/sourcing-collection-coordinator.service';
import { Sourcing1688KeywordSearchService } from '../application/service/sourcing-1688-keyword-search.service';
import { Sourcing1688ImageSearchService } from '../application/service/sourcing-1688-image-search.service';
import {
  hashCollectionRequest,
  map1688HotProductsToAuthorizedOutput,
  normalizeCollectionTarget,
} from '../application/service/sourcing-collection-mappers';
import type { SourcingCollectionPermit } from '../application/port/out/repository/sourcing-collection.repository.port';
import {
  SOURCING_1688_KEYWORD_COLLECTOR_KEY,
  SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
} from '../application/port/out/repository/sourcing-1688-search-result.repository.port';

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

  it('replays a committed zero-result keyword run without reopening the provider session', async () => {
    const attempt = await createAttempt(primary);
    const service = new Sourcing1688KeywordSearchService(
      new SourcingCollectionCoordinator(collections),
      new Sourcing1688SearchResultRepositoryAdapter(primary as unknown as PrismaService),
    );
    const session: Search1688KeywordSession = {
      searchKeyword: vi.fn(async () => []),
      close: vi.fn(async () => undefined),
    };
    const signal = new AbortController().signal;
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      operationRunId: attempt.runId,
      actorUserId: TEST_USER_ID,
      keyword: '儿童笔袋',
      session,
      signal,
      operationCheckpoint: vi.fn(async () => undefined),
      commitWithinActiveOperationAttempt: <T>(
        commit: (transaction: ActiveOperationAttemptTransaction) => Promise<T>,
      ) =>
        verifier.withActiveDomainAttemptFence(exactFence(attempt), async (_active, transaction) =>
          commit(transaction)),
    };

    await expect(service.searchForOperation(input)).resolves.toMatchObject({
      outcome: 'no_change',
      discovered: 0,
      accepted: 0,
      duplicate: 0,
      failed: 0,
    });
    const searchResults = new Sourcing1688SearchResultRepositoryAdapter(
      primary as unknown as PrismaService,
    );
    const snapshot = await searchResults.findLatest({
      organizationId: TEST_ORGANIZATION_ID,
      keywords: ['儿童笔袋'],
    });
    expect(snapshot.generatedAt).toBeInstanceOf(Date);
    expect(snapshot.observations).toEqual([expect.objectContaining({
      keyword: '儿童笔袋',
      targetId: null,
      items: [],
    })]);
    const identity = keywordCollectionIdentity(attempt.runId, '儿童笔袋');
    const run = await primary.sourcingEvidenceIngestionRun.findFirst({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: identity.idempotencyKey,
      },
      select: { id: true },
    });
    if (!run) throw new Error('Expected committed keyword run.');
    await expect(searchResults.findCompletedKeywordRun({
      organizationId: TEST_ORGANIZATION_ID,
      runId: run.id,
      operationRunId: attempt.runId,
      keyword: '儿童笔袋',
      ...identity,
      maxResults: 6,
    })).resolves.toEqual(expect.objectContaining({
      keyword: '儿童笔袋',
      targetId: null,
      items: [],
    }));

    await expect(service.searchForOperation(input)).resolves.toMatchObject({
      outcome: 'no_change',
      discovered: 0,
      accepted: 0,
      duplicate: 0,
      failed: 0,
    });

    expect(session.searchKeyword).toHaveBeenCalledTimes(1);
    await expect(primary.sourcing1688OfferKeywordObservation.count()).resolves.toBe(0);
    await expect(primary.sourcingEvidenceIngestionRun.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceKey: '1688.hot_product',
        collectorKey: 'operation-1688-keyword-search',
      },
    })).resolves.toBe(1);
  });

  it('does not commit a completed empty marker when a live-like provider extraction is indeterminate', async () => {
    const attempt = await createAttempt(primary);
    const service = new Sourcing1688KeywordSearchService(
      new SourcingCollectionCoordinator(collections),
      new Sourcing1688SearchResultRepositoryAdapter(primary as unknown as PrismaService),
    );
    const session: Search1688KeywordSession = {
      searchKeyword: vi.fn(async () => {
        throw new Sourcing1688KeywordProviderError('search_extraction_failed');
      }),
      close: vi.fn(async () => undefined),
    };

    await expect(service.searchForOperation(keywordOperationInput(attempt, session, verifier))).rejects.toMatchObject({
      code: 'search_extraction_failed',
    });

    expect(session.searchKeyword).toHaveBeenCalledTimes(1);
    await expect(primary.sourcing1688OfferKeywordObservation.count()).resolves.toBe(0);
    await expect(primary.sourcingEvidenceIngestionRun.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceKey: '1688.hot_product',
        collectorKey: SOURCING_1688_KEYWORD_COLLECTOR_KEY,
        status: { in: ['complete', 'partial'] },
      },
    })).resolves.toBe(0);
  });

  it.each([
    {
      name: 'all-accepted provider result',
      items: [acceptedKeywordItem()],
      expected: {
        outcome: 'complete', discovered: 1, accepted: 1, duplicate: 0, failed: 0,
        terminalStatus: 'complete', rejectedCount: 0,
      },
    },
    {
      name: 'all-rejected provider result',
      items: [rejectedKeywordItem()],
      expected: {
        outcome: 'failed', discovered: 1, accepted: 0, duplicate: 0, failed: 1,
        errorCode: 'all_results_rejected', terminalStatus: 'partial', rejectedCount: 1,
      },
    },
    {
      name: 'mixed provider result',
      items: [acceptedKeywordItem(), rejectedKeywordItem()],
      expected: {
        outcome: 'complete', discovered: 2, accepted: 1, duplicate: 0, failed: 1,
        terminalStatus: 'partial', rejectedCount: 1,
      },
    },
  ])('replays a $name with its original bounded outcome and counters', async ({ items, expected }) => {
    const attempt = await createAttempt(primary);
    const searchResults = new Sourcing1688SearchResultRepositoryAdapter(
      primary as unknown as PrismaService,
    );
    const service = new Sourcing1688KeywordSearchService(
      new SourcingCollectionCoordinator(collections),
      searchResults,
    );
    const session: Search1688KeywordSession = {
      searchKeyword: vi.fn(async () => items),
      close: vi.fn(async () => undefined),
    };
    const input = keywordOperationInput(attempt, session, verifier);

    const serviceExpected = {
      outcome: expected.outcome,
      discovered: expected.discovered,
      accepted: expected.accepted,
      duplicate: expected.duplicate,
      failed: expected.failed,
      ...(expected.errorCode ? { errorCode: expected.errorCode } : {}),
    };
    await expect(service.searchForOperation(input)).resolves.toMatchObject(serviceExpected);
    await expect(service.searchForOperation(input)).resolves.toMatchObject(serviceExpected);

    const identity = keywordCollectionIdentity(attempt.runId, '儿童笔袋');
    const run = await primary.sourcingEvidenceIngestionRun.findFirst({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: identity.idempotencyKey,
      },
      select: { id: true },
    });
    if (!run) throw new Error('Expected committed keyword run.');
    await expect(searchResults.findCompletedKeywordRun({
      organizationId: TEST_ORGANIZATION_ID,
      runId: run.id,
      operationRunId: attempt.runId,
      keyword: '儿童笔袋',
      ...identity,
      maxResults: 6,
    })).resolves.toMatchObject({
      terminalStatus: expected.terminalStatus,
      discoveredCount: expected.discovered,
      acceptedCount: expected.accepted,
      duplicateCount: expected.duplicate,
      rejectedCount: expected.failed,
      ...(expected.errorCode ? { errorCode: expected.errorCode } : {}),
    });
    expect(session.searchKeyword).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: 'all-accepted image result',
      items: [acceptedImageItem()],
      expected: {
        outcome: 'complete', discovered: 1, accepted: 1, duplicate: 0, failed: 0,
        errorCode: null, terminalStatus: 'complete', rejectedCount: 0,
      },
    },
    {
      name: 'durable zero image result',
      items: [],
      expected: {
        outcome: 'no_change', discovered: 0, accepted: 0, duplicate: 0, failed: 0,
        errorCode: null, terminalStatus: 'complete', rejectedCount: 0,
      },
    },
    {
      name: 'all-rejected image result',
      items: [rejectedImageItem()],
      expected: {
        outcome: 'failed', discovered: 1, accepted: 0, duplicate: 0, failed: 1,
        errorCode: 'all_results_rejected', terminalStatus: 'partial', rejectedCount: 1,
      },
    },
    {
      name: 'mixed image result',
      items: [acceptedImageItem(), rejectedImageItem()],
      expected: {
        outcome: 'complete', discovered: 2, accepted: 1, duplicate: 0, failed: 1,
        errorCode: null, terminalStatus: 'partial', rejectedCount: 1,
      },
    },
  ])('replays a $name with its original bounded outcome and counters', async ({ items, expected }) => {
    const searchResults = new Sourcing1688SearchResultRepositoryAdapter(
      primary as unknown as PrismaService,
    );
    const provider: Sourcing1688ImageSearchPort = {
      getStatus: vi.fn(),
      searchByImage: vi.fn(async (input) => ({
        imageUrl: input.imageUrl,
        convertedImageUrl: null,
        items,
      })),
    };
    const service = new Sourcing1688ImageSearchService(
      provider,
      new SourcingCollectionCoordinator(collections),
      { refresh: vi.fn() } as never,
      searchResults,
    );
    const operationRunId = randomUUID();
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      operationRunId,
      actorUserId: TEST_USER_ID,
      targetId: 'product-1::',
      imageUrl: 'https://thumbnail10.coupangcdn.com/owner.jpg',
      keyword: '儿童笔袋文具盒',
      signal: new AbortController().signal,
      checkpoint: vi.fn(async () => undefined),
    };
    const serviceExpected = {
      outcome: expected.outcome,
      discovered: expected.discovered,
      accepted: expected.accepted,
      duplicate: expected.duplicate,
      failed: expected.failed,
      ...(expected.errorCode ? { errorCode: expected.errorCode } : {}),
    };

    await expect(service.searchForOperation(input)).resolves.toMatchObject(serviceExpected);
    await expect(service.searchForOperation(input)).resolves.toMatchObject(serviceExpected);

    const identity = imageCollectionIdentity({
      operationRunId,
      targetId: input.targetId,
      imageUrl: input.imageUrl,
      keyword: input.keyword,
    });
    const run = await primary.sourcingEvidenceIngestionRun.findFirst({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: identity.idempotencyKey,
      },
      select: { id: true },
    });
    if (!run) throw new Error('Expected committed image run.');
    await expect(searchResults.findCompletedImageRun({
      organizationId: TEST_ORGANIZATION_ID,
      runId: run.id,
      operationRunId,
      targetId: input.targetId,
      keyword: input.keyword,
      ...identity,
      maxResults: 18,
    })).resolves.toMatchObject({
      terminalStatus: expected.terminalStatus,
      discoveredCount: expected.discovered,
      acceptedCount: expected.accepted,
      duplicateCount: expected.duplicate,
      rejectedCount: expected.rejectedCount,
      errorCode: expected.errorCode,
    });
    expect(provider.searchByImage).toHaveBeenCalledTimes(1);
  });

  it('fails closed for a failed exact replay run instead of returning an older completed zero result', async () => {
    const olderAttempt = await createAttempt(primary);
    const currentAttempt = await createAttempt(primary);
    const searchResults = new Sourcing1688SearchResultRepositoryAdapter(
      primary as unknown as PrismaService,
    );
    const service = new Sourcing1688KeywordSearchService(
      new SourcingCollectionCoordinator(collections),
      searchResults,
    );
    const session: Search1688KeywordSession = {
      searchKeyword: vi.fn(async () => []),
      close: vi.fn(async () => undefined),
    };
    const makeInput = (attempt: Attempt) => ({
      organizationId: TEST_ORGANIZATION_ID,
      operationRunId: attempt.runId,
      actorUserId: TEST_USER_ID,
      keyword: '儿童笔袋',
      session,
      signal: new AbortController().signal,
      operationCheckpoint: vi.fn(async () => undefined),
      commitWithinActiveOperationAttempt: <T>(
        commit: (transaction: ActiveOperationAttemptTransaction) => Promise<T>,
      ) => verifier.withActiveDomainAttemptFence(exactFence(attempt), async (_active, transaction) =>
        commit(transaction)),
    });

    await expect(service.searchForOperation(makeInput(olderAttempt))).resolves.toMatchObject({
      outcome: 'no_change',
    });

    const identity = keywordCollectionIdentity(currentAttempt.runId, '儿童笔袋');
    const failedRun = await primary.sourcingEvidenceIngestionRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceKey: '1688.hot_product',
        scopeKey: 'default',
        targetKey: identity.targetKey,
        idempotencyKey: identity.idempotencyKey,
        requestHash: identity.requestHash,
        collectorKey: SOURCING_1688_KEYWORD_COLLECTOR_KEY,
        collectorVersion: SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
        triggerKind: 'manual',
        triggeredByUserId: TEST_USER_ID,
        status: 'failed',
        completedAt: new Date(),
        errorCode: 'test_failed_run',
        errorMessage: 'test-only failed replay run',
      },
    });

    await expect(searchResults.findCompletedKeywordRun({
      organizationId: TEST_ORGANIZATION_ID,
      runId: failedRun.id,
      operationRunId: currentAttempt.runId,
      keyword: '儿童笔袋',
      ...identity,
      maxResults: 6,
    })).resolves.toBeNull();
    await expect(service.searchForOperation(makeInput(currentAttempt))).rejects.toThrow(
      'Completed keyword search result is unavailable.',
    );

    expect(session.searchKeyword).toHaveBeenCalledTimes(1);
    await expect(primary.sourcingEvidenceIngestionRun.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceKey: '1688.hot_product',
      },
    })).resolves.toBe(2);
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

function keywordCollectionIdentity(operationRunId: string, keyword: string) {
  const targetKey = normalizeCollectionTarget(keyword);
  return {
    targetKey,
    idempotencyKey: `1688-keyword-operation:${operationRunId}:${hashCollectionRequest(targetKey)}`,
    requestHash: hashCollectionRequest({
      operationRunId,
      keyword,
      maxResults: 6,
    }),
  };
}

function imageCollectionIdentity(input: {
  operationRunId: string;
  targetId: string;
  imageUrl: string;
  keyword: string;
}) {
  return {
    targetKey: `image-target:${hashCollectionRequest(input.targetId)}`,
    idempotencyKey: `1688-image-operation:${input.operationRunId}:${hashCollectionRequest(
      input.targetId,
    )}`,
    requestHash: hashCollectionRequest({
      operationRunId: input.operationRunId,
      targetId: input.targetId,
      imageUrl: input.imageUrl,
      keyword: input.keyword,
      maxResults: 18,
    }),
  };
}

function keywordOperationInput(
  attempt: Attempt,
  session: Search1688KeywordSession,
  verifier: OperationAttemptVerifierService,
) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    operationRunId: attempt.runId,
    actorUserId: TEST_USER_ID,
    keyword: '儿童笔袋',
    session,
    signal: new AbortController().signal,
    operationCheckpoint: vi.fn(async () => undefined),
    commitWithinActiveOperationAttempt: <T>(
      commit: (transaction: ActiveOperationAttemptTransaction) => Promise<T>,
    ) => verifier.withActiveDomainAttemptFence(exactFence(attempt), async (_active, transaction) =>
      commit(transaction)),
  };
}

function acceptedKeywordItem() {
  return {
    offerId: 'offer-accepted',
    title: 'Accepted offer',
    priceCny: 12.5,
    sourceUrl: 'https://detail.1688.com/offer/123456.html',
    imageUrl: null,
    monthlySales: 10,
    tradeScore: null,
    repurchaseRate: null,
    supplierName: null,
    score: 88,
  };
}

function rejectedKeywordItem() {
  return {
    ...acceptedKeywordItem(),
    offerId: null,
  };
}

function acceptedImageItem() {
  return {
    title: 'Accepted image offer',
    priceCny: 12.5,
    sourceUrl: 'https://detail.1688.com/offer/123456.html',
    imageUrl: null,
    score: 88,
  };
}

function rejectedImageItem() {
  return {
    ...acceptedImageItem(),
    sourceUrl: 'http://localhost:3000/offer/123456',
  };
}
