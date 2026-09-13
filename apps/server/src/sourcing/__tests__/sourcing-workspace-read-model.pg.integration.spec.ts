import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { SourcingRecommendationRepositoryAdapter } from '../adapter/out/repository/sourcing-recommendation.repository.adapter';
import { SourcingRecommendationSourceRepositoryAdapter } from '../adapter/out/repository/sourcing-recommendation-source.repository.adapter';
import { SourcingReviewRepositoryAdapter } from '../adapter/out/repository/sourcing-review.repository.adapter';
import { SourcingValidationRepositoryAdapter } from '../adapter/out/repository/sourcing-validation.repository.adapter';
import { SourcingReviewService } from '../application/service/sourcing-review.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

const BUSINESS_DATE = new Date('2026-08-10T00:00:00.000Z');
const CUTOFF_AT = new Date('2026-08-10T12:00:00.000Z');
const ITEM_KEY_A = 'a'.repeat(64);
const ITEM_KEY_B = 'b'.repeat(64);

describe('Sourcing workspace normalized read model (PG integration)', () => {
  let prisma: PrismaClient;
  let recommendations: SourcingRecommendationRepositoryAdapter;
  let sources: SourcingRecommendationSourceRepositoryAdapter;
  let validations: SourcingValidationRepositoryAdapter;
  let reviews: SourcingReviewRepositoryAdapter;
  let reviewService: SourcingReviewService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    recommendations = new SourcingRecommendationRepositoryAdapter(prismaService);
    sources = new SourcingRecommendationSourceRepositoryAdapter(prismaService);
    validations = new SourcingValidationRepositoryAdapter(prismaService);
    reviews = new SourcingReviewRepositoryAdapter(prismaService);
    reviewService = new SourcingReviewService(recommendations, reviews);
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('isolates organizations and applies deterministic latest-run and item ordering', async () => {
    await seedRun(prisma, {
      id: '00000000-0000-4000-8000-000000000010',
      organizationId: TEST_ORGANIZATION_ID,
      completedAt: BUSINESS_DATE,
      manifest: 'older',
      items: [],
    });
    const latest = await seedRun(prisma, {
      id: '00000000-0000-4000-8000-000000000011',
      organizationId: TEST_ORGANIZATION_ID,
      completedAt: BUSINESS_DATE,
      manifest: 'latest',
      items: [
        { id: '00000000-0000-4000-8000-000000000002', itemKey: ITEM_KEY_B, rank: 1 },
        { id: '00000000-0000-4000-8000-000000000003', itemKey: ITEM_KEY_A, rank: 1 },
      ],
    });
    await seedRun(prisma, {
      id: '00000000-0000-4000-8000-000000000012',
      organizationId: OTHER_ORGANIZATION_ID,
      completedAt: new Date('2026-08-10T11:00:00.000Z'),
      manifest: 'other-organization',
      items: [{ id: '00000000-0000-4000-8000-000000000004', itemKey: ITEM_KEY_A, rank: 1 }],
    });

    await expect(recommendations.findLatest({
      organizationId: TEST_ORGANIZATION_ID,
      now: CUTOFF_AT,
    })).resolves.toMatchObject({
      id: latest.id,
      items: [{ itemKey: ITEM_KEY_A }, { itemKey: ITEM_KEY_B }],
    });
    await expect(recommendations.findLatest({
      organizationId: OTHER_ORGANIZATION_ID,
      now: CUTOFF_AT,
    })).resolves.toMatchObject({
      id: '00000000-0000-4000-8000-000000000012',
      items: [{ itemKey: ITEM_KEY_A }],
    });
  });

  it('excludes failed and malformed observations without failing the organization read', async () => {
    const accepted = await seedOfferObservation(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOfferId: '607635921546',
      sourceKeyword: '유아 우산',
      rawOffer: { minOrderQuantity: 2 },
      status: 'COMPLETE',
    });
    await seedOfferObservation(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOfferId: '607635921547',
      sourceKeyword: '유아 우산',
      rawOffer: [],
      status: 'COMPLETE',
    });
    await seedOfferObservation(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOfferId: '607635921548',
      sourceKeyword: '유아 우산',
      rawOffer: { minOrderQuantity: 3 },
      status: 'FAILED',
    });

    await expect(sources.listLatestOfferObservations({
      organizationId: TEST_ORGANIZATION_ID,
      cutoffAt: CUTOFF_AT,
      lookbackDays: 30,
      limit: 50,
    })).resolves.toEqual({
      items: [expect.objectContaining({ id: accepted.id, externalOfferId: '607635921546' })],
      rejectedCount: 1,
    });
  });

  it('returns one compare-and-swap winner for concurrent selection writes', async () => {
    const run = await seedRun(prisma, {
      id: '00000000-0000-4000-8000-000000000020',
      organizationId: TEST_ORGANIZATION_ID,
      completedAt: BUSINESS_DATE,
      manifest: 'selection-run',
      items: [{ id: '00000000-0000-4000-8000-000000000021', itemKey: ITEM_KEY_A, rank: 1 }],
    });

    const attempts = await Promise.allSettled([
      reviewService.saveSelection({
        organizationId: TEST_ORGANIZATION_ID,
        workspaceKey: 'entry',
        recommendationRunId: run.id,
        itemKey: ITEM_KEY_A,
        state: 'selected',
        expectedVersion: 0,
      }),
      reviewService.saveSelection({
        organizationId: TEST_ORGANIZATION_ID,
        workspaceKey: 'entry',
        recommendationRunId: run.id,
        itemKey: ITEM_KEY_A,
        state: 'removed',
        expectedVersion: 0,
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.find((attempt) => attempt.status === 'rejected')).toMatchObject({
      reason: { status: 409 },
    });
    await expect(reviews.listSelections({
      organizationId: TEST_ORGANIZATION_ID,
      workspaceKey: 'entry',
      recommendationRunId: run.id,
    })).resolves.toEqual([
      expect.objectContaining({ itemKey: ITEM_KEY_A, version: 1 }),
    ]);
  });

  it('creates a review-only batch without decision, intent, or order side effects', async () => {
    const observation = await seedOfferObservation(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOfferId: '607635921546',
      sourceKeyword: '유아 우산',
      rawOffer: { minOrderQuantity: 2 },
      status: 'COMPLETE',
    });
    const run = await seedRun(prisma, {
      id: '00000000-0000-4000-8000-000000000030',
      organizationId: TEST_ORGANIZATION_ID,
      completedAt: BUSINESS_DATE,
      manifest: 'review-run',
      items: [{
        id: '00000000-0000-4000-8000-000000000031',
        itemKey: ITEM_KEY_A,
        rank: 1,
        externalOfferId: observation.externalOfferId,
        sourceSnapshot: { offerObservationIds: [observation.id] },
      }],
    });
    const before = await sideEffectCounts(prisma);

    const idempotencyKey = randomUUID();
    const [batch, repeated] = await Promise.all([
      reviewService.createBatch({
        organizationId: TEST_ORGANIZATION_ID,
        requestedByUserId: TEST_USER_ID,
        recommendationRunId: run.id,
        itemKeys: [ITEM_KEY_A],
        idempotencyKey,
      }),
      reviewService.createBatch({
        organizationId: TEST_ORGANIZATION_ID,
        requestedByUserId: TEST_USER_ID,
        recommendationRunId: run.id,
        itemKeys: [ITEM_KEY_A],
        idempotencyKey,
      }),
    ]);

    expect(batch).toMatchObject({
      status: 'awaiting_procurement_enablement',
      itemCount: 1,
    });
    expect(repeated).toMatchObject({ id: batch.id, itemCount: 1 });
    await expect(sideEffectCounts(prisma)).resolves.toEqual(before);
    await expect(prisma.sourcingReviewBatchItem.count({
      where: { organizationId: TEST_ORGANIZATION_ID, reviewBatchId: batch.id },
    })).resolves.toBe(1);
    await expect(prisma.sourcingReviewBatch.count({
      where: { organizationId: TEST_ORGANIZATION_ID, idempotencyKey },
    })).resolves.toBe(1);
  });

  it('pages validation rows by updatedAt then id', async () => {
    const run = await seedRun(prisma, {
      id: '00000000-0000-4000-8000-000000000040',
      organizationId: TEST_ORGANIZATION_ID,
      completedAt: BUSINESS_DATE,
      manifest: 'validation-run',
      items: [
        { id: '00000000-0000-4000-8000-000000000041', itemKey: ITEM_KEY_A, rank: 1 },
        { id: '00000000-0000-4000-8000-000000000042', itemKey: ITEM_KEY_B, rank: 2 },
      ],
    });
    const updatedAt = new Date('2026-08-10T11:30:00.000Z');
    await prisma.sourcingValidationEpisode.createMany({
      data: [
        validationEpisode({
          id: '00000000-0000-4000-8000-000000000050',
          organizationId: TEST_ORGANIZATION_ID,
          recommendationRunId: run.id,
          recommendationItemId: '00000000-0000-4000-8000-000000000041',
        }),
        validationEpisode({
          id: '00000000-0000-4000-8000-000000000051',
          organizationId: TEST_ORGANIZATION_ID,
          recommendationRunId: run.id,
          recommendationItemId: '00000000-0000-4000-8000-000000000042',
        }),
      ],
    });
    await prisma.sourcingValidationEpisode.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, recommendationRunId: run.id },
      data: { updatedAt },
    });

    const first = await validations.listForRun({
      organizationId: TEST_ORGANIZATION_ID,
      recommendationRunId: run.id,
      limit: 1,
    });
    const second = await validations.listForRun({
      organizationId: TEST_ORGANIZATION_ID,
      recommendationRunId: run.id,
      limit: 1,
      cursor: first.nextCursor ?? undefined,
    });

    expect(first.items.map((item) => item.itemKey)).toEqual([ITEM_KEY_B]);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(second.items.map((item) => item.itemKey)).toEqual([ITEM_KEY_A]);
  });
});

async function seedRun(
  prisma: PrismaClient,
  input: {
    id: string;
    organizationId: string;
    completedAt: Date;
    manifest: string;
    items: Array<{
      id: string;
      itemKey: string;
      rank: number;
      externalOfferId?: string;
      sourceSnapshot?: Record<string, unknown>;
    }>;
  },
) {
  const run = await prisma.sourcingRecommendationRun.create({
    data: {
      id: input.id,
      organizationId: input.organizationId,
      policyKey: 'sourcing_workspace',
      policyVersion: 'test-v1',
      modelVersion: 'test-v1',
      calculationVersion: 'test-v1',
      inputManifestHash: sha256(`${input.organizationId}:${input.manifest}`),
      inputManifest: { manifest: input.manifest },
      status: 'complete',
      businessDate: BUSINESS_DATE,
      generatedAt: input.completedAt,
      completedAt: input.completedAt,
      expiresAt: null,
      warningCodes: [],
    },
  });
  if (input.items.length > 0) {
    await prisma.sourcingRecommendationItem.createMany({
      data: input.items.map((item) => ({
        id: item.id,
        organizationId: input.organizationId,
        recommendationRunId: run.id,
        itemKey: item.itemKey,
        sourcePlatform: '1688',
        externalOfferId: item.externalOfferId ?? '607635921546',
        variantKeyNormalized: '',
        matchedCoupangProductId: null,
        displayName: `추천 ${item.itemKey.slice(0, 1)}`,
        rank: item.rank,
        score: 80,
        grade: 'A',
        baselineAction: 'order',
        reasonCodes: [],
        riskCodes: [],
        scoreComponents: {},
        sourceSnapshot: item.sourceSnapshot ?? {},
      })),
    });
  }
  return run;
}

async function seedOfferObservation(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    externalOfferId: string;
    sourceKeyword: string;
    rawOffer: object | unknown[];
    status: 'COMPLETE' | 'FAILED';
  },
) {
  const idempotencyKey = randomUUID();
  const actorUserId = input.organizationId === TEST_ORGANIZATION_ID
    ? TEST_USER_ID
    : OTHER_USER_ID;
  const ingestionRun = await prisma.sourcingEvidenceIngestionRun.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      sourceKey: '1688.hot_product',
      scopeKey: 'workspace-read-model-test',
      targetKey: `${input.sourceKeyword}:${input.externalOfferId}:${idempotencyKey}`,
      idempotencyKey,
      requestHash: sha256(idempotencyKey),
      collectorKey: 'workspace-read-model-test',
      collectorVersion: 'v1',
      triggerKind: 'manual',
      triggeredByUserId: actorUserId,
      status: input.status,
      isCurrentComplete: input.status === 'COMPLETE',
      completedAt: CUTOFF_AT,
    },
  });
  const evidenceId = randomUUID();
  await prisma.sourcingEvidenceObservation.create({
    data: {
      id: evidenceId,
      organizationId: input.organizationId,
      ingestionRunId: ingestionRun.id,
      sourceKey: '1688.hot_product',
      platform: '1688',
      evidenceFamily: 'hot_product',
      signalRole: 'supply',
      conceptKey: input.sourceKeyword,
      supportsCandidate: true,
      observationKey: sha256(`observation:${idempotencyKey}`),
      revision: 1,
      sourceEntityType: 'supplier_offer',
      sourceEntityKey: input.externalOfferId,
      observationType: 'offer_keyword_observation',
      schemaVersion: '1688-hot-product/v2',
      evidenceClass: 'observed',
      eventAt: BUSINESS_DATE,
      observedAt: BUSINESS_DATE,
      availableAt: BUSINESS_DATE,
      businessDate: BUSINESS_DATE,
      sourceUrl: `https://detail.1688.com/offer/${input.externalOfferId}.html`,
      payloadHash: sha256(`payload:${idempotencyKey}`),
      envelopeHash: sha256(`envelope:${idempotencyKey}`),
      payload: input.rawOffer,
      ingestedAt: BUSINESS_DATE,
    },
  });
  return prisma.sourcing1688OfferKeywordObservation.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      evidenceObservationId: evidenceId,
      ingestionRunId: ingestionRun.id,
      businessDate: BUSINESS_DATE,
      sourceKeywordNormalized: input.sourceKeyword,
      externalOfferId: input.externalOfferId,
      variantKeyNormalized: '',
      sourceUrl: `https://detail.1688.com/offer/${input.externalOfferId}.html`,
      title: '유아 우산',
      supplierName: '우산 공장',
      imageUrl: 'https://example.test/umbrella.jpg',
      rank: 1,
      priceCny: 12.5,
      monthlySales: 20,
      rawOffer: input.rawOffer,
      capturedAt: BUSINESS_DATE,
    },
  });
}

function validationEpisode(input: {
  id: string;
  organizationId: string;
  recommendationRunId: string;
  recommendationItemId: string;
}) {
  return {
    id: input.id,
    organizationId: input.organizationId,
    recommendationRunId: input.recommendationRunId,
    recommendationItemId: input.recommendationItemId,
    status: 'blocked',
    policyKey: 'sourcing_validation',
    policyVersion: 'test-v1',
    evidenceCutoffAt: BUSINESS_DATE,
    completedAt: BUSINESS_DATE,
    summary: { score: 80, landedCostKrw: null, expectedMarginBps: null },
  };
}

async function sideEffectCounts(prisma: PrismaClient) {
  const [decisionBatches, procurementIntents, purchaseOrders] = await Promise.all([
    prisma.sourcingDecisionBatch.count(),
    prisma.procurementTestIntent.count(),
    prisma.purchaseOrder.count(),
  ]);
  return { decisionBatches, procurementIntents, purchaseOrders };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
