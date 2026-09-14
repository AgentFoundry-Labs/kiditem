import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../../../test-helpers/real-prisma';
import {
  buildCanonicalSupplierOfferEvidencePayload,
  buildProcurementTestIntentRequestHash,
  buildSupplierOfferSnapshotHash,
} from '../../../../domain/policy/sourcing-procurement';
import { SupplySourcingProcurementRepositoryAdapter } from '../supply-sourcing-procurement.repository.adapter';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import type {
  CreateProcurementTestIntentRecord,
  CreateSupplierOfferSnapshotRecord,
} from '../../../../application/port/out/repository/supply-sourcing-procurement.repository.port';

const CAPTURED_AT = new Date('2026-09-12T00:00:00.000Z');

describe('Supply sourcing procurement source handoff (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let repository: SupplySourcingProcurementRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new SupplySourcingProcurementRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('accepts canonical COMPLETE evidence, then rejects a new handoff after a completed-empty refresh', async () => {
    const source = await seedOfferEvidence(prisma);
    const createdOffer = await repository.createOfferSnapshot(
      TEST_ORGANIZATION_ID,
      source.offer,
    );
    expect(createdOffer).toMatchObject({ kind: 'created' });
    if (createdOffer.kind !== 'created')
      throw new Error('Expected offer creation.');

    const decision = await seedDecisionContext(
      prisma,
      createdOffer.snapshot.id,
    );
    const firstIntent = intentRecord({
      snapshot: createdOffer.snapshot,
      decisionBatchItemId: decision.itemId,
      launchCandidateId: decision.launchId,
      priceTierId: createdOffer.snapshot.priceTiers[0]!.id,
      idempotencyKey: 'supply-handoff:first',
    });

    await expect(
      repository.createTestIntent(TEST_ORGANIZATION_ID, firstIntent),
    ).resolves.toMatchObject({ kind: 'created' });
    await expect(
      repository.findProcurementDecisionContext(
        OTHER_ORGANIZATION_ID,
        decision.itemId,
      ),
    ).resolves.toBeNull();

    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: source.runId },
      data: { isCurrentComplete: false },
    });
    await seedRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      status: 'COMPLETE',
      isCurrentComplete: true,
      generation: 2,
      acceptedCount: 0,
    });

    await expect(
      repository.createTestIntent(TEST_ORGANIZATION_ID, {
        ...firstIntent,
        idempotencyKey: 'supply-handoff:after-empty',
      }),
    ).resolves.toEqual({ kind: 'evidence_observation_not_terminal' });
    await expect(
      repository.createTestIntent(TEST_ORGANIZATION_ID, firstIntent),
    ).resolves.toMatchObject({ kind: 'duplicate' });
    expect(await prisma.procurementTestIntent.count()).toBe(1);
  });

  it('rejects new handoffs from an observation replaced by a newer revision', async () => {
    const source = await seedOfferEvidence(prisma);
    const createdOffer = await repository.createOfferSnapshot(
      TEST_ORGANIZATION_ID,
      source.offer,
    );
    expect(createdOffer).toMatchObject({ kind: 'created' });
    if (createdOffer.kind !== 'created')
      throw new Error('Expected offer creation.');
    const decision = await seedDecisionContext(
      prisma,
      createdOffer.snapshot.id,
    );

    await prisma.sourcingEvidenceObservation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ingestionRunId: source.runId,
        supersedesObservationId: source.observationId,
        sourceKey: '1688.offer',
        platform: '1688',
        evidenceFamily: 'supplier_offer',
        signalRole: 'supply',
        conceptKey: 'stationery',
        supportsCandidate: true,
        observationKey: source.observationKey,
        revision: 2,
        sourceEntityType: 'supplier_offer_sku',
        sourceEntityKey: 'sku-1',
        observationType: 'offer_snapshot',
        schemaVersion: '1688-offer/v1',
        evidenceClass: 'measured',
        eventAt: CAPTURED_AT,
        observedAt: CAPTURED_AT,
        availableAt: new Date(),
        payloadHash: sha256('offer-payload-v2'),
        envelopeHash: sha256('offer-envelope-v2'),
        payload: inputJson(
          buildCanonicalSupplierOfferEvidencePayload(source.offer),
        ),
        ingestedAt: new Date(),
      },
    });

    const nextIntent = intentRecord({
      snapshot: createdOffer.snapshot,
      decisionBatchItemId: decision.itemId,
      launchCandidateId: decision.launchId,
      priceTierId: createdOffer.snapshot.priceTiers[0]!.id,
      idempotencyKey: 'supply-handoff:after-revision',
    });
    await expect(
      repository.createTestIntent(TEST_ORGANIZATION_ID, nextIntent),
    ).resolves.toEqual({ kind: 'evidence_observation_not_terminal' });
    expect(await prisma.procurementTestIntent.count()).toBe(0);
  });

  it('rejects missing, non-complete, and cross-organization source provenance', async () => {
    const missing = offerRecord(randomUUID());
    await expect(
      repository.createOfferSnapshot(TEST_ORGANIZATION_ID, missing),
    ).resolves.toEqual({ kind: 'evidence_observation_not_found' });

    const running = await seedOfferEvidence(prisma, {
      status: 'RUNNING',
      isCurrentComplete: false,
    });
    await expect(
      repository.createOfferSnapshot(TEST_ORGANIZATION_ID, running.offer),
    ).resolves.toEqual({ kind: 'evidence_observation_not_found' });

    const other = await seedOfferEvidence(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
    });
    await expect(
      repository.createOfferSnapshot(TEST_ORGANIZATION_ID, other.offer),
    ).resolves.toEqual({ kind: 'evidence_observation_not_found' });
    expect(await prisma.supplierOfferSkuSnapshot.count()).toBe(0);
  });
});

async function seedOfferEvidence(
  prisma: PrismaClient,
  input: {
    organizationId?: string;
    userId?: string;
    status?: 'RUNNING' | 'COMPLETE';
    isCurrentComplete?: boolean;
  } = {},
) {
  const organizationId = input.organizationId ?? TEST_ORGANIZATION_ID;
  const userId = input.userId ?? TEST_USER_ID;
  const status = input.status ?? 'COMPLETE';
  const observationId = randomUUID();
  const observationKey = sha256(`offer-observation:${observationId}`);
  const offer = offerRecord(observationId);
  const run = await seedRun(prisma, {
    organizationId,
    userId,
    status,
    isCurrentComplete: input.isCurrentComplete ?? status === 'COMPLETE',
    generation: 1,
    acceptedCount: 1,
  });
  await prisma.sourcingEvidenceObservation.create({
    data: {
      id: observationId,
      organizationId,
      ingestionRunId: run.id,
      sourceKey: '1688.offer',
      platform: '1688',
      evidenceFamily: 'supplier_offer',
      signalRole: 'supply',
      conceptKey: 'stationery',
      supportsCandidate: true,
      observationKey,
      revision: 1,
      sourceEntityType: 'supplier_offer_sku',
      sourceEntityKey: 'sku-1',
      observationType: 'offer_snapshot',
      schemaVersion: '1688-offer/v1',
      evidenceClass: 'measured',
      eventAt: CAPTURED_AT,
      observedAt: CAPTURED_AT,
      availableAt: CAPTURED_AT,
      sourceUrl: offer.sourceUrl,
      payloadHash: sha256('offer-payload-v1'),
      envelopeHash: sha256('offer-envelope-v1'),
      payload: inputJson(buildCanonicalSupplierOfferEvidencePayload(offer)),
      ingestedAt: CAPTURED_AT,
    },
  });
  return { runId: run.id, observationId, observationKey, offer };
}

function seedRun(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    userId: string;
    status: 'RUNNING' | 'COMPLETE';
    isCurrentComplete: boolean;
    generation: number;
    acceptedCount: number;
  },
) {
  const identity = randomUUID();
  return prisma.sourcingEvidenceIngestionRun.create({
    data: {
      organizationId: input.organizationId,
      sourceKey: '1688.offer',
      scopeKey: 'default',
      targetKey: 'stationery',
      idempotencyKey: identity,
      requestHash: sha256(identity),
      collectorKey: 'supply-handoff-test',
      collectorVersion: 'v1',
      triggerKind: 'manual',
      triggeredByUserId: input.userId,
      status: input.status,
      isCurrentComplete: input.isCurrentComplete,
      generation: input.generation,
      discoveredCount: input.acceptedCount,
      acceptedCount: input.acceptedCount,
      coverageNumerator: 1,
      coverageDenominator: 1,
      completedAt: input.status === 'COMPLETE' ? CAPTURED_AT : null,
    },
  });
}

function offerRecord(
  evidenceObservationId: string,
): CreateSupplierOfferSnapshotRecord {
  const offer = {
    evidenceObservationId,
    supplierId: null,
    supplierName: 'Yiwu Top Toy',
    identityStatus: 'exact_variant' as const,
    sourcePlatform: '1688',
    sourceUrl: 'https://detail.1688.com/offer/1.html',
    externalSupplierKey: 'supplier-key-1',
    externalOfferId: 'offer-1',
    externalSkuId: 'sku-1',
    variantKey: 'color:red',
    productName: 'Magnetic blocks',
    variantName: 'Red',
    currency: 'CNY',
    orderUnit: 'carton',
    unitsPerOrderUnit: 24,
    minOrderQuantity: 10,
    sampleAvailable: true,
    samplePriceCny: '18.00',
    domesticFreightCny: '20.00',
    productionLeadTimeDaysMin: 7,
    productionLeadTimeDaysMax: 14,
    dispatchLeadTimeDaysMin: 1,
    dispatchLeadTimeDaysMax: 3,
    grossWeightGrams: 2500,
    lengthMm: 300,
    widthMm: 200,
    heightMm: 100,
    material: 'ABS',
    packCount: 24,
    capturedAt: CAPTURED_AT,
    validUntil: new Date('2099-01-01T00:00:00.000Z'),
    priceTiers: [{ minQuantity: 10, maxQuantity: null, unitPriceCny: '12.30' }],
  };
  return { ...offer, snapshotHash: buildSupplierOfferSnapshotHash(offer) };
}

async function seedDecisionContext(
  prisma: PrismaClient,
  supplierOfferSkuSnapshotId: string,
) {
  const account = await prisma.channelAccount.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      channel: 'coupang',
      name: 'Supply launch account',
      externalAccountId: randomUUID(),
    },
  });
  const launch = await prisma.sourcingLaunchCandidate.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      supplierOfferSkuSnapshotId,
      targetChannelAccountId: account.id,
      candidateSeriesKey: sha256(randomUUID()),
      revision: 1,
      identityHash: sha256(randomUUID()),
      name: 'Magnetic blocks launch',
      productConceptVersionKey: 'concept-v1',
      koreanSellableBundleVersionKey: 'bundle-v1',
      launchPlanVersionKey: 'launch-v1',
      complianceAssessmentVersionKey: 'compliance-v1',
      ipClearanceVersionKey: 'ip-v1',
      qualitySpecVersionKey: 'quality-v1',
      intendedUse: 'kids toy',
      materialProfileKey: 'material-v1',
      labelingProfileKey: 'label-v1',
      unitsPerSellableBundle: 6,
      initialOrderQuantity: 10,
      targetSalePriceKrw: 19_900,
      fulfillmentMode: 'rocket',
      createdByUserId: TEST_USER_ID,
    },
  });
  const decision = await prisma.sourcingDecisionBatch.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      requestedByUserId: TEST_USER_ID,
      idempotencyKey: randomUUID(),
      requestHash: sha256(randomUUID()),
      decisionMode: 'active',
      businessDate: CAPTURED_AT,
      decisionAt: CAPTURED_AT,
      evidenceCutoffAt: CAPTURED_AT,
      policyKey: 'supply-test',
      policyVersion: 'v1',
      status: 'active',
      keyword: 'magnetic blocks',
      modelPipeline: 'deterministic',
      modelGeneratorVersion: 'v1',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    },
  });
  const item = await prisma.sourcingDecisionBatchItem.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      decisionBatchId: decision.id,
      launchCandidateId: launch.id,
      supplierOfferSkuSnapshotId,
      itemKey: sha256(randomUUID()),
      modelCandidateId: 'candidate-1',
      displayName: 'Magnetic blocks',
      rank: 1,
      baselineDecision: 'test_order',
      decision: 'test_order',
      executionEligible: true,
      confidenceKind: 'coverage',
    },
  });
  return { itemId: item.id, launchId: launch.id };
}

function intentRecord(input: {
  snapshot: {
    id: string;
    snapshotHash: string;
  };
  decisionBatchItemId: string;
  launchCandidateId: string;
  priceTierId: string;
  idempotencyKey: string;
}): CreateProcurementTestIntentRecord {
  const record = {
    supplierOfferSkuSnapshotId: input.snapshot.id,
    sourceRecommendationArtifactId: input.decisionBatchItemId,
    launchCandidateId: input.launchCandidateId,
    decisionBatchItemId: input.decisionBatchItemId,
    selectedPriceTierId: input.priceTierId,
    requestedByUserId: TEST_USER_ID,
    reviewedByUserId: null,
    intentType: 'test_order' as const,
    status: 'proposed' as const,
    idempotencyKey: input.idempotencyKey,
    requestedPurchaseUnits: 10,
    unitsPerPurchaseUnit: 24,
    unitsPerSellableBundle: 6,
    requestedSellableUnits: 40,
    selectedUnitPriceCny: '12.30',
    expectedGoodsTotalCny: '123.00',
    currency: 'CNY',
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    reviewedAt: null,
    reviewReason: null,
  };
  return {
    ...record,
    requestHash: buildProcurementTestIntentRequestHash({
      supplierOfferSkuSnapshotId: input.snapshot.id,
      supplierOfferSnapshotHash: input.snapshot.snapshotHash,
      selection: {
        intentType: record.intentType,
        sourceRecommendationArtifactId: record.sourceRecommendationArtifactId,
        launchCandidateId: record.launchCandidateId,
        decisionBatchItemId: record.decisionBatchItemId,
        selectedPriceTierId: record.selectedPriceTierId,
        requestedPurchaseUnits: record.requestedPurchaseUnits,
        unitsPerPurchaseUnit: record.unitsPerPurchaseUnit,
        unitsPerSellableBundle: record.unitsPerSellableBundle,
        requestedSellableUnits: record.requestedSellableUnits,
        selectedUnitPriceCny: record.selectedUnitPriceCny,
        expectedGoodsTotalCny: record.expectedGoodsTotalCny,
        currency: record.currency,
        expiresAt: record.expiresAt,
      },
    }),
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
