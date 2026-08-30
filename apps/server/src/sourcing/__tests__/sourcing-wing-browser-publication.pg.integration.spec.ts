import { createHash, randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { OperationRepositoryAdapter } from '../../operations/adapter/out/repository/operation.repository.adapter';
import { OperationAttemptVerifierService } from '../../operations/application/service/operation-attempt-verifier.service';
import { OperationLifecycleGateService } from '../../operations/application/service/operation-lifecycle-gate.service';
import { SourcingCollectionRepositoryAdapter } from '../adapter/out/repository/sourcing-collection.repository.adapter';
import { SourcingRecommendationRepositoryAdapter } from '../adapter/out/repository/sourcing-recommendation.repository.adapter';
import { SourcingRecommendationSourceRepositoryAdapter } from '../adapter/out/repository/sourcing-recommendation-source.repository.adapter';
import { canonicalJson } from '../domain/sourcing-stable-json';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ActiveBrowserAttemptTransaction } from '../../operations/application/port/active-browser-attempt-transaction';
import type {
  ClaimAuthorizedRunInput,
  SourcingCollectionPermit,
} from '../application/port/out/repository/sourcing-collection.repository.port';

const OPERATION_KEY = 'sourcing.collect_wing_catalog_batch';
const KEYWORD = 'slime';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('Wing browser publication boundaries (PG integration)', () => {
  let primary: PrismaClient;
  let contender: PrismaClient;
  let verifier: OperationAttemptVerifierService;
  let collections: SourcingCollectionRepositoryAdapter;
  let recommendations: SourcingRecommendationRepositoryAdapter;
  let sources: SourcingRecommendationSourceRepositoryAdapter;

  beforeAll(async () => {
    primary = makeTestPrisma();
    contender = makeTestPrisma();
    await Promise.all([primary.$connect(), contender.$connect()]);
    const operationRepository = new OperationRepositoryAdapter(
      primary as unknown as PrismaService,
    );
    const gate = new OperationLifecycleGateService();
    gate.open();
    verifier = new OperationAttemptVerifierService(operationRepository, gate);
    collections = new SourcingCollectionRepositoryAdapter(
      primary as unknown as PrismaService,
    );
    recommendations = new SourcingRecommendationRepositoryAdapter(
      primary as unknown as PrismaService,
    );
    sources = new SourcingRecommendationSourceRepositoryAdapter(
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

  it('holds the exact Operation attempt lock until its observation commit', async () => {
    const attempt = await createActiveAttempt(primary, [KEYWORD]);
    const operationLocked = deferred();
    const release = deferred();
    const publication = verifier.withActiveBrowserAttemptFence(
      fenceInput(attempt),
      async (_active, transaction) => {
        operationLocked.resolve();
        const claim = await collections.claimAuthorizedRunInAttempt(
          transaction,
          batchClaim(attempt.runId, KEYWORD),
        );
        if (claim.kind !== 'claimed') throw new Error('batch_not_claimed');
        await release.promise;
        return collections.commitInAttempt(transaction, {
          permit: claim.permit,
          output: observationOutput(claim.permit, 'older-product'),
        });
      },
    );
    await operationLocked.promise;

    let cancellationSettled = false;
    const cancellation = cancelAttempt(contender, attempt.runId).finally(() => {
      cancellationSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(cancellationSettled).toBe(false);

    release.resolve();
    await expect(publication).resolves.toMatchObject({ kind: 'committed' });
    await cancellation;
    await expect(primary.sourcingEvidenceObservation.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toBe(1);
  });

  it('uses the same Operation-row-first lock for the repository cancellation transition', async () => {
    const attempt = await createActiveAttempt(primary, [KEYWORD]);
    const locked = deferred();
    const release = deferred();
    const publication = verifier.withActiveBrowserAttemptFence(
      fenceInput(attempt),
      async () => {
        locked.resolve();
        await release.promise;
      },
    );
    await locked.promise;
    const cancellingRepository = new OperationRepositoryAdapter(
      contender as unknown as PrismaService,
    );
    let cancellationSettled = false;
    const cancellation = cancellingRepository.transition({
      organizationId: TEST_ORGANIZATION_ID,
      runId: attempt.runId,
      expectedStatuses: ['running'],
      status: 'cancelled',
      finishedAt: new Date(),
      attemptToken: null,
      leaseExpiresAt: null,
    }).finally(() => {
      cancellationSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(cancellationSettled).toBe(false);

    release.resolve();
    await publication;
    await expect(cancellation).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('does not persist owner evidence when cancellation wins the Operation lock', async () => {
    const attempt = await createActiveAttempt(primary, [KEYWORD]);
    const acquired = deferred();
    const release = deferred();
    const cancellation = contender.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM operation_runs
        WHERE id = ${attempt.runId}::uuid
          AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
        FOR UPDATE
      `;
      await tx.operationRun.update({
        where: { id: attempt.runId },
        data: { status: 'cancelled', attemptToken: null, leaseExpiresAt: null },
      });
      acquired.resolve();
      await release.promise;
    });
    await acquired.promise;
    let callbackCalls = 0;
    const publication = verifier.withActiveBrowserAttemptFence(
      fenceInput(attempt),
      async (_active, transaction) => {
        callbackCalls += 1;
        const claim = await collections.claimAuthorizedRunInAttempt(
          transaction,
          batchClaim(attempt.runId, KEYWORD),
        );
        if (claim.kind !== 'claimed') throw new Error('batch_not_claimed');
        return collections.commitInAttempt(transaction, {
          permit: claim.permit,
          output: observationOutput(claim.permit, 'stale-product'),
        });
      },
    );
    release.resolve();
    await cancellation;

    await expect(publication).rejects.toBeInstanceOf(ConflictException);
    expect(callbackCalls).toBe(0);
    await expect(primary.sourcingEvidenceObservation.count()).resolves.toBe(0);
  });

  it('keeps staged recommendation work invisible when the attempt is cancelled before finalize publication', async () => {
    const attempt = await createActiveAttempt(primary, [KEYWORD]);
    const finalizePermit = await claimFinalize(attempt);
    const recommendationRunId = await createStagedRecommendation(primary);
    await cancelAttempt(contender, attempt.runId);

    await expect(verifier.withActiveBrowserAttemptFence(
      fenceInput(attempt),
      async (_active, transaction) => {
        const committed = await collections.commitInAttempt(transaction, {
          permit: finalizePermit,
          output: finalizeOutput(attempt.runId, KEYWORD, 'unused-batch'),
        });
        if (committed.kind !== 'committed') throw new Error('finalize_not_committed');
        return recommendations.publishStagedRunInAttempt(transaction, {
          organizationId: TEST_ORGANIZATION_ID,
          runId: recommendationRunId,
        });
      },
    )).rejects.toBeInstanceOf(ConflictException);

    await expect(primary.sourcingRecommendationRun.findUniqueOrThrow({
      where: { id: recommendationRunId },
      select: { status: true },
    })).resolves.toEqual({ status: 'staged_complete' });
    await expect(primary.sourcingEvidenceIngestionRun.findUniqueOrThrow({
      where: { id: finalizePermit.runId },
      select: { status: true },
    })).resolves.toEqual({ status: 'collecting' });
  });

  it('returns only the latest published run and lets a latest empty snapshot replace old rows', async () => {
    const older = await createActiveAttempt(primary, [KEYWORD]);
    const olderPublished = await publishSnapshot(older, 'older-product');
    await cancelAttempt(primary, older.runId);

    const newer = await createActiveAttempt(primary, [KEYWORD]);
    const newerPublished = await publishSnapshot(newer, 'newer-product');
    await expect(sources.listWingCatalogSnapshot({
      organizationId: TEST_ORGANIZATION_ID,
      normalizedKeyword: KEYWORD,
      limit: 400,
    })).resolves.toMatchObject({
      generatedAt: newerPublished.completedAt,
      items: [{ productId: 'newer-product' }],
    });
    expect(newerPublished.completedAt.getTime()).toBeGreaterThanOrEqual(
      olderPublished.completedAt.getTime(),
    );
    await cancelAttempt(primary, newer.runId);

    const empty = await createActiveAttempt(primary, [KEYWORD]);
    const emptyPublished = await publishSnapshot(empty, null);
    await expect(sources.listWingCatalogSnapshot({
      organizationId: TEST_ORGANIZATION_ID,
      normalizedKeyword: KEYWORD,
      limit: 400,
    })).resolves.toEqual({
      generatedAt: emptyPublished.completedAt,
      items: [],
      rejectedCount: 0,
    });
  });

  it('ignores newer failed, incomplete, other-keyword, and other-organization markers', async () => {
    const published = await createActiveAttempt(primary, [KEYWORD]);
    const publication = await publishSnapshot(published, 'published-product');
    await cancelAttempt(primary, published.runId);

    const later = new Date(publication.completedAt.getTime() + 60_000);
    await Promise.all([
      createSyntheticFinalizeMarker(primary, {
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        idempotencyKey: 'newer-failed-marker',
        targetKey: 'finalize:newer-failed-marker',
        status: 'failed',
        completedAt: later,
        keyword: KEYWORD,
      }),
      createSyntheticFinalizeMarker(primary, {
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        idempotencyKey: 'newer-incomplete-marker',
        targetKey: 'finalize:newer-incomplete-marker',
        status: 'collecting',
        completedAt: null,
        keyword: KEYWORD,
      }),
      createSyntheticFinalizeMarker(primary, {
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        idempotencyKey: 'newer-other-keyword-marker',
        targetKey: 'finalize:newer-other-keyword-marker',
        status: 'complete',
        completedAt: later,
        keyword: 'clay',
      }),
      createSyntheticFinalizeMarker(primary, {
        organizationId: OTHER_ORGANIZATION_ID,
        triggeredByUserId: OTHER_USER_ID,
        idempotencyKey: 'newer-other-organization-marker',
        targetKey: 'finalize:newer-other-organization-marker',
        status: 'complete',
        completedAt: later,
        keyword: KEYWORD,
      }),
    ]);

    await expect(sources.listWingCatalogSnapshot({
      organizationId: TEST_ORGANIZATION_ID,
      normalizedKeyword: KEYWORD,
      limit: 400,
    })).resolves.toMatchObject({
      generatedAt: publication.completedAt,
      items: [{ productId: 'published-product' }],
      rejectedCount: 0,
    });
  });

  it('falls back past newer corrupt and dangling publications to the newest valid snapshot', async () => {
    const published = await createActiveAttempt(primary, [KEYWORD]);
    const valid = await publishSnapshot(published, 'valid-product');
    await cancelAttempt(primary, published.runId);
    const baseTime = valid.completedAt.getTime();

    const wrongHashRunId = randomUUID();
    const wrongKeywordRunId = randomUUID();
    const collectingRunId = randomUUID();
    const wrongOrganizationRunId = randomUUID();
    const missingRunId = randomUUID();
    await Promise.all([
      createSyntheticBatch(primary, {
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        operationRunId: wrongHashRunId,
        keyword: KEYWORD,
        requestHash: '0'.repeat(64),
        status: 'complete',
        completedAt: new Date(baseTime + 1_000),
      }),
      createSyntheticBatch(primary, {
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        operationRunId: wrongKeywordRunId,
        keyword: 'clay',
        status: 'complete',
        completedAt: new Date(baseTime + 2_000),
      }),
      createSyntheticBatch(primary, {
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        operationRunId: collectingRunId,
        keyword: KEYWORD,
        status: 'collecting',
        completedAt: null,
      }),
      createSyntheticBatch(primary, {
        organizationId: OTHER_ORGANIZATION_ID,
        triggeredByUserId: OTHER_USER_ID,
        operationRunId: wrongOrganizationRunId,
        keyword: KEYWORD,
        status: 'complete',
        completedAt: new Date(baseTime + 3_000),
      }),
    ]);
    await Promise.all([
      createSyntheticFinalizeMarker(primary, {
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        idempotencyKey: 'corrupt-wrong-hash-marker',
        targetKey: 'finalize:corrupt-wrong-hash-marker',
        status: 'complete',
        completedAt: new Date(baseTime + 2_000),
        keyword: KEYWORD,
        operationRunId: wrongHashRunId,
        batchIdempotencyKey: keywordBatchKey(wrongHashRunId, KEYWORD),
      }),
      createSyntheticFinalizeMarker(primary, {
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        idempotencyKey: 'corrupt-wrong-keyword-marker',
        targetKey: 'finalize:corrupt-wrong-keyword-marker',
        status: 'complete',
        completedAt: new Date(baseTime + 3_000),
        keyword: KEYWORD,
        operationRunId: wrongKeywordRunId,
        batchIdempotencyKey: keywordBatchKey(wrongKeywordRunId, 'clay'),
      }),
      createSyntheticFinalizeMarker(primary, {
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        idempotencyKey: 'corrupt-collecting-batch-marker',
        targetKey: 'finalize:corrupt-collecting-batch-marker',
        status: 'complete',
        completedAt: new Date(baseTime + 4_000),
        keyword: KEYWORD,
        operationRunId: collectingRunId,
        batchIdempotencyKey: keywordBatchKey(collectingRunId, KEYWORD),
      }),
      createSyntheticFinalizeMarker(primary, {
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        idempotencyKey: 'corrupt-wrong-org-batch-marker',
        targetKey: 'finalize:corrupt-wrong-org-batch-marker',
        status: 'complete',
        completedAt: new Date(baseTime + 6_000),
        keyword: KEYWORD,
        operationRunId: wrongOrganizationRunId,
        batchIdempotencyKey: keywordBatchKey(wrongOrganizationRunId, KEYWORD),
      }),
      createSyntheticFinalizeMarker(primary, {
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        idempotencyKey: 'corrupt-missing-batch-marker',
        targetKey: 'finalize:corrupt-missing-batch-marker',
        status: 'complete',
        completedAt: new Date(baseTime + 8_000),
        keyword: KEYWORD,
        operationRunId: missingRunId,
        batchIdempotencyKey: keywordBatchKey(missingRunId, KEYWORD),
      }),
      createSyntheticFinalizeMarker(primary, {
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        idempotencyKey: 'corrupt-quality-report-marker',
        targetKey: 'finalize:corrupt-quality-report-marker',
        status: 'complete',
        completedAt: new Date(baseTime + 10_000),
        keyword: KEYWORD,
        qualityReport: {
          source: 'unexpected-source',
          operationRunId: randomUUID(),
          purpose: 'catalog_search',
          snapshots: [
            {
              keyword: KEYWORD,
              batchIdempotencyKey: 'wing-operation:corrupt-quality-report',
            },
          ],
        },
      }),
    ]);

    await expect(
      sources.listWingCatalogSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        normalizedKeyword: KEYWORD,
        limit: 400,
      }),
    ).resolves.toMatchObject({
      generatedAt: valid.completedAt,
      items: [{ productId: 'valid-product' }],
      rejectedCount: 0,
    });
  });

  it('orders equally completed valid publications by stable marker id', async () => {
    const olderId = '70000000-0000-4000-8000-000000000001';
    const newerId = '70000000-0000-4000-8000-000000000002';
    const completedAt = new Date('2026-08-14T08:00:00.000Z');
    const olderRunId = randomUUID();
    const newerRunId = randomUUID();
    const [olderBatch, newerBatch] = await Promise.all([
      createSyntheticBatch(primary, {
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        operationRunId: olderRunId,
        keyword: KEYWORD,
        status: 'complete',
        completedAt,
      }),
      createSyntheticBatch(primary, {
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        operationRunId: newerRunId,
        keyword: KEYWORD,
        status: 'complete',
        completedAt,
      }),
    ]);
    await Promise.all([
      createSyntheticFinalizeMarker(primary, {
        id: olderId,
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        idempotencyKey: 'equal-time-older-marker',
        targetKey: 'finalize:equal-time-older-marker',
        status: 'complete',
        completedAt,
        keyword: KEYWORD,
        operationRunId: olderRunId,
        batchIdempotencyKey: olderBatch.idempotencyKey,
      }),
      createSyntheticFinalizeMarker(primary, {
        id: newerId,
        organizationId: TEST_ORGANIZATION_ID,
        triggeredByUserId: TEST_USER_ID,
        idempotencyKey: 'equal-time-newer-marker',
        targetKey: 'finalize:equal-time-newer-marker',
        status: 'complete',
        completedAt,
        keyword: KEYWORD,
        operationRunId: newerRunId,
        batchIdempotencyKey: newerBatch.idempotencyKey,
      }),
    ]);
    await Promise.all([
      createSyntheticObservation(primary, olderBatch.id, 'equal-time-older-product'),
      createSyntheticObservation(primary, newerBatch.id, 'equal-time-newer-product'),
    ]);

    await expect(
      sources.listWingCatalogSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        normalizedKeyword: KEYWORD,
        limit: 400,
      }),
    ).resolves.toMatchObject({
      generatedAt: completedAt,
      items: [{ productId: 'equal-time-newer-product' }],
    });
  });

  async function claimFinalize(
    attempt: Awaited<ReturnType<typeof createActiveAttempt>>,
  ): Promise<SourcingCollectionPermit> {
    return verifier.withActiveBrowserAttemptFence(
      fenceInput(attempt),
      async (_active, transaction) => {
        const claim = await collections.claimRecoverableRunInAttempt(
          transaction,
          finalizeClaim(attempt.runId),
        );
        if (claim.kind !== 'claimed') throw new Error('finalize_not_claimed');
        return claim.permit;
      },
    );
  }

  async function publishSnapshot(
    attempt: Awaited<ReturnType<typeof createActiveAttempt>>,
    productId: string | null,
  ): Promise<{ completedAt: Date }> {
    const batch = await verifier.withActiveBrowserAttemptFence(
      fenceInput(attempt),
      async (_active, transaction) => {
        const input = batchClaim(attempt.runId, KEYWORD);
        const claim = await collections.claimAuthorizedRunInAttempt(transaction, input);
        if (claim.kind !== 'claimed') throw new Error('batch_not_claimed');
        const committed = await collections.commitInAttempt(transaction, {
          permit: claim.permit,
          output: productId
            ? observationOutput(claim.permit, productId)
            : emptyObservationOutput(),
        });
        if (committed.kind !== 'committed') throw new Error('batch_not_committed');
        return { idempotencyKey: input.idempotencyKey };
      },
    );
    const permit = await claimFinalize(attempt);
    await verifier.withActiveBrowserAttemptFence(
      fenceInput(attempt),
      async (_active, transaction) => {
        const committed = await collections.commitInAttempt(transaction, {
          permit,
          output: finalizeOutput(attempt.runId, KEYWORD, batch.idempotencyKey),
        });
        if (committed.kind !== 'committed') throw new Error('finalize_not_committed');
      },
    );
    const marker = await primary.sourcingEvidenceIngestionRun.findUniqueOrThrow({
      where: { id: permit.runId },
      select: { completedAt: true },
    });
    if (!marker.completedAt) throw new Error('finalize_timestamp_missing');
    return { completedAt: marker.completedAt };
  }
});

async function createActiveAttempt(prisma: PrismaClient, keywords: string[]) {
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
      input: { keywords, maxPages: 1, purpose: 'catalog_search' },
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
  return { organizationId: TEST_ORGANIZATION_ID, runId, attemptToken };
}

function fenceInput(attempt: Awaited<ReturnType<typeof createActiveAttempt>>) {
  return {
    ...attempt,
    expectedOperationKey: OPERATION_KEY,
  };
}

function batchClaim(operationRunId: string, keyword: string): ClaimAuthorizedRunInput {
  const idempotencyKey = keywordBatchKey(operationRunId, keyword);
  return {
    organizationId: TEST_ORGANIZATION_ID,
    sourceKey: 'coupang.wing_catalog',
    scopeKey: 'default',
    targetKey: `keyword:${keyword}`,
    idempotencyKey,
    requestHash: collectionHash({ operationRunId, normalizedKeyword: keyword }),
    collectorKey: 'wing-catalog-observation-ingest',
    collectorVersion: 'test',
    triggerKind: 'extension',
    triggeredByUserId: TEST_USER_ID,
    leaseDurationMs: 60_000,
  };
}

function finalizeClaim(operationRunId: string): ClaimAuthorizedRunInput {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    sourceKey: 'coupang.wing_catalog',
    scopeKey: 'default',
    targetKey: `finalize:${operationRunId}`,
    idempotencyKey: `wing-operation:${operationRunId}:finalize`,
    requestHash: collectionHash({
      operationRunId,
      purpose: 'catalog_search',
      kind: 'finalize',
    }),
    collectorKey: 'wing-catalog-operation-finalize',
    collectorVersion: 'test',
    triggerKind: 'extension',
    triggeredByUserId: TEST_USER_ID,
    leaseDurationMs: 60_000,
  };
}

function observationOutput(permit: SourcingCollectionPermit, productId: string) {
  const capturedAt = new Date();
  const payload = wingPayload(productId, capturedAt);
  return {
    observations: [{
      organizationId: TEST_ORGANIZATION_ID,
      ingestionRunId: permit.runId,
      sourceKey: permit.sourceKey,
      platform: 'coupang',
      evidenceFamily: 'wing_catalog',
      signalRole: 'demand' as const,
      granularity: 'exact_own' as const,
      conceptKey: KEYWORD,
      sourceEntityType: 'coupang_product',
      sourceEntityId: productId,
      schemaVersion: 'coupang-wing-catalog/v2',
      observationKey: sha256(`${permit.runId}:${productId}`),
      revision: 1,
      supportsCandidate: false,
      sourceUrl: null,
      eventAt: capturedAt,
      observedAt: capturedAt,
      availableAt: capturedAt,
      revisionAt: null,
      payloadHash: sha256(JSON.stringify(payload)),
      rawPayload: payload,
      ingestedAt: capturedAt,
    }],
    typedRecords: [],
    discoveredCount: 1,
    rejectedCount: 0,
    qualityReport: { source: 'coupang-wing-catalog', rowCount: 1 },
  };
}

function emptyObservationOutput() {
  return {
    observations: [],
    typedRecords: [],
    discoveredCount: 0,
    rejectedCount: 0,
    qualityReport: { source: 'coupang-wing-catalog', rowCount: 0 },
  };
}

function finalizeOutput(
  operationRunId: string,
  keyword: string,
  batchIdempotencyKey: string,
) {
  return {
    observations: [],
    typedRecords: [],
    discoveredCount: 0,
    rejectedCount: 0,
    qualityReport: {
      source: 'coupang-wing-catalog-finalize',
      operationRunId,
      purpose: 'catalog_search',
      recommendationRunId: null,
      snapshots: [{ keyword, batchIdempotencyKey }],
    },
  };
}

function wingPayload(productId: string, capturedAt: Date) {
  return {
    productId,
    itemId: null,
    vendorItemId: null,
    productName: productId,
    itemName: null,
    brandName: null,
    manufacture: null,
    categoryHierarchy: null,
    imagePath: null,
    salePriceKrw: null,
    ratingAverage: null,
    ratingCount: null,
    viewsLast28d: null,
    salesLast28d: null,
    estimatedRevenue28d: null,
    conversionRate28d: null,
    deliveryInfo: null,
    sourceKeyword: KEYWORD,
    capturedAt: capturedAt.toISOString(),
  };
}

async function createStagedRecommendation(prisma: PrismaClient): Promise<string> {
  const id = randomUUID();
  await prisma.sourcingRecommendationRun.create({
    data: {
      id,
      organizationId: TEST_ORGANIZATION_ID,
      policyKey: 'sourcing_workspace',
      policyVersion: 'test',
      modelVersion: 'test',
      calculationVersion: 'test',
      inputManifestHash: sha256(id),
      inputManifest: {},
      status: 'staged_complete',
      businessDate: new Date(),
      generatedAt: new Date(),
      completedAt: null,
      warningCodes: [],
    },
  });
  return id;
}

async function createSyntheticFinalizeMarker(
  prisma: PrismaClient,
  input: {
    id?: string;
    organizationId: string;
    triggeredByUserId: string;
    idempotencyKey: string;
    targetKey: string;
    status: string;
    completedAt: Date | null;
    keyword: string;
    operationRunId?: string;
    batchIdempotencyKey?: string;
    qualityReport?: Prisma.InputJsonValue;
  },
) {
  const reportOperationRunId =
    isRecord(input.qualityReport) && typeof input.qualityReport.operationRunId === 'string'
      ? input.qualityReport.operationRunId
      : null;
  const reportPurpose =
    isRecord(input.qualityReport) && typeof input.qualityReport.purpose === 'string'
      ? input.qualityReport.purpose
      : 'catalog_search';
  const operationRunId = input.operationRunId ?? reportOperationRunId ?? randomUUID();
  return prisma.sourcingEvidenceIngestionRun.create({
    data: {
      id: input.id,
      organizationId: input.organizationId,
      sourceKey: 'coupang.wing_catalog',
      scopeKey: 'default',
      targetKey: `finalize:${operationRunId}`,
      idempotencyKey: `wing-operation:${operationRunId}:finalize`,
      requestHash: collectionHash({
        operationRunId,
        purpose: reportPurpose,
        kind: 'finalize',
      }),
      collectorKey: 'wing-catalog-operation-finalize',
      collectorVersion: 'test',
      triggerKind: 'extension',
      triggeredByUserId: input.triggeredByUserId,
      status: input.status,
      completedAt: input.completedAt,
      qualityReport: input.qualityReport ?? {
        source: 'coupang-wing-catalog-finalize',
        operationRunId,
        purpose: 'catalog_search',
        snapshots: [
          {
            keyword: input.keyword,
            batchIdempotencyKey:
              input.batchIdempotencyKey ?? keywordBatchKey(operationRunId, input.keyword),
          },
        ],
      },
    },
  });
}

async function createSyntheticBatch(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    triggeredByUserId: string;
    operationRunId: string;
    keyword: string;
    requestHash?: string;
    status: string;
    completedAt: Date | null;
  },
) {
  return prisma.sourcingEvidenceIngestionRun.create({
    data: {
      organizationId: input.organizationId,
      sourceKey: 'coupang.wing_catalog',
      scopeKey: 'default',
      targetKey: `keyword:${input.keyword}`,
      idempotencyKey: keywordBatchKey(input.operationRunId, input.keyword),
      requestHash:
        input.requestHash ??
        collectionHash({
          operationRunId: input.operationRunId,
          normalizedKeyword: input.keyword,
        }),
      collectorKey: 'wing-catalog-observation-ingest',
      collectorVersion: 'test',
      triggerKind: 'extension',
      triggeredByUserId: input.triggeredByUserId,
      status: input.status,
      completedAt: input.completedAt,
    },
  });
}

async function createSyntheticObservation(
  prisma: PrismaClient,
  ingestionRunId: string,
  productId: string,
) {
  const capturedAt = new Date('2026-08-14T08:00:00.000Z');
  const payload = wingPayload(productId, capturedAt);
  return prisma.sourcingEvidenceObservation.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      ingestionRunId,
      sourceKey: 'coupang.wing_catalog',
      platform: 'coupang',
      evidenceFamily: 'wing_catalog',
      signalRole: 'demand',
      conceptKey: KEYWORD,
      sourceEntityType: 'coupang_product',
      sourceEntityKey: productId,
      observationType: 'wing_catalog',
      schemaVersion: 'coupang-wing-catalog/v2',
      evidenceClass: 'exact_own',
      observationKey: sha256(`${ingestionRunId}:${productId}`),
      revision: 1,
      supportsCandidate: false,
      eventAt: capturedAt,
      observedAt: capturedAt,
      availableAt: capturedAt,
      payloadHash: sha256(JSON.stringify(payload)),
      payload,
      ingestedAt: capturedAt,
    },
  });
}

function keywordBatchKey(operationRunId: string, keyword: string): string {
  return `wing-operation:${operationRunId}:${collectionHash(keyword)}`;
}

function collectionHash(value: unknown): string {
  return sha256(canonicalJson(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function cancelAttempt(prisma: PrismaClient, runId: string) {
  return prisma.operationRun.update({
    where: { id: runId },
    data: {
      status: 'cancelled',
      attemptToken: null,
      leaseExpiresAt: null,
      finishedAt: new Date(),
    },
  });
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
