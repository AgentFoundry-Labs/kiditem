import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { SupplySourcingProcurementRepositoryAdapter } from '../supply-sourcing-procurement.repository.adapter';
import {
  buildCanonicalSupplierOfferEvidencePayload,
  buildProcurementTestIntentRequestHash,
} from '../../../../domain/policy/sourcing-procurement';
import type {
  CreateProcurementTestIntentRecord,
  CreateSupplierOfferSnapshotRecord,
} from '../../../../application/port/out/repository/supply-sourcing-procurement.repository.port';

const NOW = new Date('2026-08-01T00:00:00.000Z');

function rawOffer() {
  return {
    id: 'snapshot-1',
    organizationId: 'org-1',
    evidenceObservationId: 'evidence-1',
    supplierId: null,
    supplierName: 'Yiwu Top Toy',
    identityStatus: 'exact_variant',
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
    samplePriceCny: new Prisma.Decimal('18.00'),
    domesticFreightCny: new Prisma.Decimal('20.00'),
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
    capturedAt: NOW,
    validUntil: new Date('2026-08-10T00:00:00.000Z'),
    snapshotHash: 'a'.repeat(64),
    createdAt: NOW,
    priceTiers: [
      {
        id: 'tier-1',
        organizationId: 'org-1',
        supplierOfferSkuSnapshotId: 'snapshot-1',
        minQuantity: 10,
        maxQuantity: null,
        unitPriceCny: new Prisma.Decimal('12.30'),
        createdAt: NOW,
      },
    ],
  };
}

function rawIntent(overrides: Record<string, unknown> = {}) {
  const record = intentRecord();
  return {
    id: 'intent-1',
    organizationId: 'org-1',
    decisionBatchItemId: 'decision-item-1',
    launchCandidateId: 'launch-1',
    supplierOfferSkuSnapshotId: 'snapshot-1',
    selectedPriceTierId: 'tier-1',
    sourceRecommendationArtifactId: 'decision-item-1',
    requestedByUserId: 'user-1',
    reviewedByUserId: null,
    kind: 'test_order',
    status: 'proposed',
    idempotencyKey: 'key-1',
    requestHash: record.requestHash,
    requestedPurchaseUnits: 10,
    unitsPerPurchaseUnit: 24,
    unitsPerSellableBundle: 6,
    requestedSellableUnits: 40,
    selectedUnitPriceCny: new Prisma.Decimal('12.30'),
    expectedGoodsTotalCny: new Prisma.Decimal('123.00'),
    currency: 'CNY',
    expiresAt: new Date('2026-08-10T00:00:00.000Z'),
    reviewedAt: null,
    reviewReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    supplierOfferSkuSnapshot: rawOffer(),
    ...overrides,
  };
}

function offerRecord(): CreateSupplierOfferSnapshotRecord {
  return {
    evidenceObservationId: 'evidence-1',
    supplierId: null,
    supplierName: 'Yiwu Top Toy',
    identityStatus: 'exact_variant',
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
    capturedAt: NOW,
    validUntil: new Date('2026-08-10T00:00:00.000Z'),
    snapshotHash: 'a'.repeat(64),
    priceTiers: [{ minQuantity: 10, maxQuantity: null, unitPriceCny: '12.30' }],
  };
}

function offerEvidence(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evidence-1',
    sourceKey: '1688-offer',
    platform: '1688',
    signalRole: 'supply',
    sourceEntityType: 'supplier_offer_sku',
    sourceEntityKey: 'sku-1',
    observationKey: 'offer-observation-1',
    revision: 1,
    schemaVersion: '1688-offer-v1',
    sourceUrl: 'https://detail.1688.com/offer/1.html',
    observedAt: NOW,
    availableAt: NOW,
    ingestedAt: NOW,
    payload: buildCanonicalSupplierOfferEvidencePayload(offerRecord()),
    ingestionRun: {
      sourceEntitlementVersionId: 'entitlement-1',
      targetKey: 'stationery',
      status: 'complete',
      completedAt: NOW,
      coverageNumerator: 10,
      coverageDenominator: 10,
    },
    ...overrides,
  };
}

function decisionItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'decision-item-1',
    supplierOfferSkuSnapshotId: 'snapshot-1',
    launchCandidateId: 'launch-1',
    decision: 'test_order',
    executionEligible: true,
    launchCandidate: {
      id: 'launch-1',
      supplierOfferSkuSnapshotId: 'snapshot-1',
      initialOrderQuantity: 10,
      unitsPerSellableBundle: 6,
    },
    decisionBatch: {
      status: 'active',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    },
    ...overrides,
  };
}

function intentRecord(
  overrides: Partial<CreateProcurementTestIntentRecord> = {},
): CreateProcurementTestIntentRecord {
  const base = {
    decisionBatchItemId: 'decision-item-1',
    launchCandidateId: 'launch-1',
    supplierOfferSkuSnapshotId: 'snapshot-1',
    selectedPriceTierId: 'tier-1',
    sourceRecommendationArtifactId: 'decision-item-1',
    requestedByUserId: 'user-1',
    reviewedByUserId: null,
    intentType: 'test_order',
    status: 'proposed',
    idempotencyKey: 'key-1',
    requestedPurchaseUnits: 10,
    unitsPerPurchaseUnit: 24,
    unitsPerSellableBundle: 6,
    requestedSellableUnits: 40,
    selectedUnitPriceCny: '12.30',
    expectedGoodsTotalCny: '123.00',
    currency: 'CNY',
    expiresAt: new Date('2026-08-10T00:00:00.000Z'),
    reviewedAt: null,
    reviewReason: null,
  };
  return {
    ...base,
    requestHash: buildProcurementTestIntentRequestHash({
      supplierOfferSkuSnapshotId: 'snapshot-1',
      supplierOfferSnapshotHash: rawOffer().snapshotHash,
      selection: {
        intentType: base.intentType,
        sourceRecommendationArtifactId: base.sourceRecommendationArtifactId,
        launchCandidateId: base.launchCandidateId,
        decisionBatchItemId: base.decisionBatchItemId,
        selectedPriceTierId: base.selectedPriceTierId,
        requestedPurchaseUnits: base.requestedPurchaseUnits,
        unitsPerPurchaseUnit: base.unitsPerPurchaseUnit,
        unitsPerSellableBundle: base.unitsPerSellableBundle,
        requestedSellableUnits: base.requestedSellableUnits,
        selectedUnitPriceCny: base.selectedUnitPriceCny,
        expectedGoodsTotalCny: base.expectedGoodsTotalCny,
        currency: base.currency,
        expiresAt: base.expiresAt,
      },
    }),
    ...overrides,
  };
}

function sourceContext(overrides: Record<string, unknown> = {}) {
  return {
    sourceKey: '1688-offer',
    ingestionRun: {
      sourceEntitlementVersionId: 'entitlement-1',
      targetKey: 'stationery',
      status: 'complete',
      completedAt: NOW,
      coverageNumerator: 10,
      coverageDenominator: 10,
    },
    ...overrides,
  };
}

function currentEntitlement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entitlement-1',
    sourceLifecycle: 'qualified',
    decisionImpact: 'enabled',
    killSwitch: false,
    permissionStartsAt: null,
    permissionExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    minimumCoverageBps: 8_000,
    ...overrides,
  };
}

function makePrisma() {
  const prisma = {
    supplier: { findFirst: vi.fn() },
    sourcingEvidenceObservation: {
      findFirst: vi.fn().mockResolvedValue(sourceContext()),
    },
    sourcingSourceEntitlementVersion: {
      findFirst: vi.fn().mockResolvedValue(currentEntitlement()),
    },
    supplierOfferSkuSnapshot: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(rawOffer()),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    organizationMembership: { findFirst: vi.fn() },
    sourcingDecisionBatchItem: { findFirst: vi.fn() },
    procurementTestIntent: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  };
  return Object.assign(prisma, {
    $queryRaw: vi.fn().mockResolvedValue([{ lock: '1', at: NOW }]),
    $transaction: vi.fn(
      async (
        callback: (
          tx: typeof prisma & { $queryRaw: ReturnType<typeof vi.fn> },
        ) => unknown,
      ) =>
        callback(
          prisma as typeof prisma & { $queryRaw: ReturnType<typeof vi.fn> },
        ),
    ),
  });
}

describe('SupplySourcingProcurementRepositoryAdapter', () => {
  it('returns the organization hash winner without writing a duplicate snapshot', async () => {
    const prisma = makePrisma();
    prisma.supplierOfferSkuSnapshot.findUnique.mockResolvedValue(rawOffer());
    const adapter = new SupplySourcingProcurementRepositoryAdapter(
      prisma as never,
    );

    const result = await adapter.createOfferSnapshot('org-1', offerRecord());

    expect(result).toMatchObject({
      kind: 'duplicate',
      snapshot: { id: 'snapshot-1' },
    });
    expect(prisma.supplierOfferSkuSnapshot.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_snapshotHash: {
            organizationId: 'org-1',
            snapshotHash: 'a'.repeat(64),
          },
        },
      }),
    );
    expect(prisma.supplierOfferSkuSnapshot.create).not.toHaveBeenCalled();
  });

  it('creates nested tiers under the active organization and maps decimals', async () => {
    const prisma = makePrisma();
    prisma.supplierOfferSkuSnapshot.findUnique.mockResolvedValue(null);
    prisma.sourcingEvidenceObservation.findFirst
      .mockResolvedValueOnce(offerEvidence())
      .mockResolvedValueOnce({ id: 'evidence-1' });
    prisma.supplierOfferSkuSnapshot.create.mockResolvedValue(rawOffer());
    const adapter = new SupplySourcingProcurementRepositoryAdapter(
      prisma as never,
    );

    const result = await adapter.createOfferSnapshot('org-1', offerRecord());

    expect(result).toMatchObject({
      kind: 'created',
      snapshot: {
        samplePriceCny: '18.00',
        priceTiers: [{ unitPriceCny: '12.30' }],
      },
    });
    expect(
      prisma.sourcingEvidenceObservation.findFirst,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'evidence-1', organizationId: 'org-1' },
        select: expect.objectContaining({
          payload: true,
          ingestionRun: expect.any(Object),
        }),
      }),
    );
    expect(
      prisma.sourcingSourceEntitlementVersion.findFirst,
    ).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        sourceKey: '1688-offer',
        scopeKey: 'stationery',
        isCurrent: true,
        retiredAt: null,
      },
      select: expect.objectContaining({
        sourceLifecycle: true,
        decisionImpact: true,
        killSwitch: true,
      }),
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.sourcingSourceEntitlementVersion.findFirst.mock
        .invocationCallOrder[0],
    );
    expect(
      prisma.sourcingSourceEntitlementVersion.findFirst.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      prisma.supplierOfferSkuSnapshot.create.mock.invocationCallOrder[0],
    );
    expect(
      prisma.sourcingEvidenceObservation.findFirst,
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          observationKey: 'offer-observation-1',
          availableAt: { lte: expect.any(Date) },
          ingestedAt: { lte: expect.any(Date) },
        },
        orderBy: [{ revision: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(prisma.supplierOfferSkuSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          priceTiers: {
            create: [
              {
                organizationId: 'org-1',
                minQuantity: 10,
                maxQuantity: null,
                unitPriceCny: '12.30',
              },
            ],
          },
        }),
      }),
    );
  });

  it('rejects a supplier offer bound to non-supply or cross-platform evidence', async () => {
    const prisma = makePrisma();
    prisma.supplierOfferSkuSnapshot.findUnique.mockResolvedValue(null);
    prisma.sourcingEvidenceObservation.findFirst.mockResolvedValue(
      offerEvidence({
        platform: 'naver',
        signalRole: 'demand',
        sourceEntityType: 'keyword',
        sourceEntityKey: '필통',
      }),
    );
    const adapter = new SupplySourcingProcurementRepositoryAdapter(
      prisma as never,
    );

    await expect(
      adapter.createOfferSnapshot('org-1', offerRecord()),
    ).resolves.toEqual({
      kind: 'evidence_observation_mismatch',
    });
    expect(prisma.supplierOfferSkuSnapshot.create).not.toHaveBeenCalled();
  });

  it('rejects non-terminal, stale, or payload-divergent supplier evidence', async () => {
    const nonTerminalPrisma = makePrisma();
    nonTerminalPrisma.supplierOfferSkuSnapshot.findUnique.mockResolvedValue(
      null,
    );
    nonTerminalPrisma.sourcingEvidenceObservation.findFirst.mockResolvedValue(
      offerEvidence({
        ingestionRun: {
          sourceEntitlementVersionId: 'entitlement-1',
          targetKey: 'stationery',
          status: 'running',
          completedAt: null,
          coverageNumerator: null,
          coverageDenominator: null,
        },
      }),
    );
    const nonTerminal = new SupplySourcingProcurementRepositoryAdapter(
      nonTerminalPrisma as never,
    );
    await expect(
      nonTerminal.createOfferSnapshot('org-1', offerRecord()),
    ).resolves.toEqual({ kind: 'evidence_observation_not_terminal' });

    const stalePrisma = makePrisma();
    stalePrisma.supplierOfferSkuSnapshot.findUnique.mockResolvedValue(null);
    stalePrisma.sourcingEvidenceObservation.findFirst
      .mockResolvedValueOnce(offerEvidence())
      .mockResolvedValueOnce({ id: 'evidence-newer' });
    const stale = new SupplySourcingProcurementRepositoryAdapter(
      stalePrisma as never,
    );
    await expect(
      stale.createOfferSnapshot('org-1', offerRecord()),
    ).resolves.toEqual({ kind: 'evidence_observation_not_latest' });

    const payloadPrisma = makePrisma();
    payloadPrisma.supplierOfferSkuSnapshot.findUnique.mockResolvedValue(null);
    payloadPrisma.sourcingEvidenceObservation.findFirst.mockResolvedValue(
      offerEvidence({
        payload: {
          supplierOffer: {
            ...buildCanonicalSupplierOfferEvidencePayload(offerRecord())
              .supplierOffer,
            minOrderQuantity: 1,
          },
        },
      }),
    );
    const payload = new SupplySourcingProcurementRepositoryAdapter(
      payloadPrisma as never,
    );
    await expect(
      payload.createOfferSnapshot('org-1', offerRecord()),
    ).resolves.toEqual({ kind: 'evidence_payload_mismatch' });
  });

  it('checks the exact current source scope under the shared advisory lock', async () => {
    const prisma = makePrisma();
    prisma.supplierOfferSkuSnapshot.findUnique.mockResolvedValue(rawOffer());
    prisma.sourcingSourceEntitlementVersion.findFirst.mockResolvedValue(
      currentEntitlement({ killSwitch: true }),
    );
    const adapter = new SupplySourcingProcurementRepositoryAdapter(
      prisma as never,
    );

    await expect(
      adapter.createOfferSnapshot('org-1', offerRecord()),
    ).resolves.toEqual({ kind: 'source_entitlement_retain_denied' });
    expect(prisma.supplierOfferSkuSnapshot.findUnique).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(
      prisma.sourcingSourceEntitlementVersion.findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          sourceKey: '1688-offer',
          scopeKey: 'stationery',
          isCurrent: true,
        }),
      }),
    );
  });

  it('does not revive evidence collected under an older entitlement version', async () => {
    const prisma = makePrisma();
    prisma.supplierOfferSkuSnapshot.findUnique.mockResolvedValue(rawOffer());
    prisma.sourcingSourceEntitlementVersion.findFirst.mockResolvedValue(
      currentEntitlement({ id: 'entitlement-2' }),
    );
    const adapter = new SupplySourcingProcurementRepositoryAdapter(
      prisma as never,
    );

    await expect(
      adapter.createOfferSnapshot('org-1', offerRecord()),
    ).resolves.toEqual({ kind: 'source_entitlement_version_mismatch' });
    await expect(
      adapter.createTestIntent('org-1', intentRecord()),
    ).resolves.toEqual({ kind: 'source_entitlement_version_mismatch' });
    expect(prisma.supplierOfferSkuSnapshot.findUnique).not.toHaveBeenCalled();
    expect(prisma.procurementTestIntent.findUnique).not.toHaveBeenCalled();
  });

  it('makes same key and same request hash a duplicate', async () => {
    const prisma = makePrisma();
    prisma.procurementTestIntent.findUnique.mockResolvedValue(rawIntent());
    const adapter = new SupplySourcingProcurementRepositoryAdapter(
      prisma as never,
    );

    const result = await adapter.createTestIntent('org-1', intentRecord());

    expect(result).toMatchObject({
      kind: 'duplicate',
      intent: { id: 'intent-1' },
    });
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
    expect(prisma.procurementTestIntent.create).not.toHaveBeenCalled();
  });

  it('makes same key and different request hash a structural conflict', async () => {
    const prisma = makePrisma();
    prisma.procurementTestIntent.findUnique.mockResolvedValue(rawIntent());
    const adapter = new SupplySourcingProcurementRepositoryAdapter(
      prisma as never,
    );

    const result = await adapter.createTestIntent(
      'org-1',
      intentRecord({ requestHash: 'c'.repeat(64) }),
    );

    expect(result).toEqual({ kind: 'idempotency_conflict' });
  });

  it('does not return another actor intent for the same idempotency key', async () => {
    const prisma = makePrisma();
    prisma.procurementTestIntent.findUnique.mockResolvedValue(rawIntent());
    const adapter = new SupplySourcingProcurementRepositoryAdapter(
      prisma as never,
    );

    const result = await adapter.createTestIntent(
      'org-1',
      intentRecord({ requestedByUserId: 'user-2' }),
    );

    expect(result).toEqual({ kind: 'idempotency_actor_mismatch' });
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
    expect(prisma.procurementTestIntent.create).not.toHaveBeenCalled();
  });

  it('does not adopt another actor intent after an idempotency race', async () => {
    const prisma = makePrisma();
    prisma.procurementTestIntent.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(rawIntent());
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'membership-1',
    });
    prisma.sourcingDecisionBatchItem.findFirst.mockResolvedValue(
      decisionItem(),
    );
    prisma.procurementTestIntent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
      }),
    );
    const adapter = new SupplySourcingProcurementRepositoryAdapter(
      prisma as never,
    );

    const result = await adapter.createTestIntent(
      'org-1',
      intentRecord({ requestedByUserId: 'user-2' }),
    );

    expect(result).toEqual({ kind: 'idempotency_actor_mismatch' });
  });

  it('validates the active organization actor before creating an intent', async () => {
    const prisma = makePrisma();
    prisma.procurementTestIntent.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findFirst.mockResolvedValue(null);
    const adapter = new SupplySourcingProcurementRepositoryAdapter(
      prisma as never,
    );

    await expect(
      adapter.createTestIntent('org-1', intentRecord()),
    ).resolves.toEqual({
      kind: 'actor_not_active',
    });
    expect(prisma.organizationMembership.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        userId: 'user-1',
        status: 'active',
        user: { isActive: true },
      },
      select: { id: true },
    });
  });

  it('blocks test orders when current source execution or run quality is ineligible', async () => {
    const shadowPrisma = makePrisma();
    shadowPrisma.sourcingSourceEntitlementVersion.findFirst.mockResolvedValue(
      currentEntitlement({
        sourceLifecycle: 'shadow',
        decisionImpact: 'disabled',
      }),
    );
    const shadowAdapter = new SupplySourcingProcurementRepositoryAdapter(
      shadowPrisma as never,
    );
    await expect(
      shadowAdapter.createTestIntent('org-1', intentRecord()),
    ).resolves.toEqual({ kind: 'source_entitlement_execution_denied' });
    expect(
      shadowPrisma.procurementTestIntent.findUnique,
    ).not.toHaveBeenCalled();

    const lowCoveragePrisma = makePrisma();
    lowCoveragePrisma.sourcingEvidenceObservation.findFirst.mockResolvedValue(
      sourceContext({
        ingestionRun: {
          sourceEntitlementVersionId: 'entitlement-1',
          targetKey: 'stationery',
          status: 'complete',
          completedAt: NOW,
          coverageNumerator: 7,
          coverageDenominator: 10,
        },
      }),
    );
    const lowCoverageAdapter = new SupplySourcingProcurementRepositoryAdapter(
      lowCoveragePrisma as never,
    );
    await expect(
      lowCoverageAdapter.createTestIntent('org-1', intentRecord()),
    ).resolves.toEqual({ kind: 'source_quality_not_execution_eligible' });
    expect(
      lowCoveragePrisma.procurementTestIntent.findUnique,
    ).not.toHaveBeenCalled();
  });

  it('creates only a proposed intent with snapshot-matched launch provenance', async () => {
    const prisma = makePrisma();
    prisma.procurementTestIntent.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'membership-1',
    });
    prisma.sourcingDecisionBatchItem.findFirst.mockResolvedValue(
      decisionItem(),
    );
    prisma.procurementTestIntent.create.mockResolvedValue(rawIntent());
    const adapter = new SupplySourcingProcurementRepositoryAdapter(
      prisma as never,
    );

    const result = await adapter.createTestIntent('org-1', intentRecord());

    expect(result).toMatchObject({
      kind: 'created',
      intent: {
        status: 'proposed',
        requestedPurchaseUnits: 10,
        unitsPerSellableBundle: 6,
        requestedSellableUnits: 40,
        selectedUnitPriceCny: '12.30',
        expectedGoodsTotalCny: '123.00',
      },
    });
    expect(prisma.sourcingDecisionBatchItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'decision-item-1', organizationId: 'org-1' },
      select: expect.objectContaining({
        decision: true,
        executionEligible: true,
        decisionBatch: { select: { status: true, expiresAt: true } },
      }),
    });
    expect(prisma.procurementTestIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          kind: 'test_order',
          status: 'proposed',
          unitsPerSellableBundle: 6,
          requestedSellableUnits: 40,
          selectedUnitPriceCny: '12.30',
          expectedGoodsTotalCny: '123.00',
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.sourcingSourceEntitlementVersion.findFirst.mock
        .invocationCallOrder[0],
    );
    expect(
      prisma.sourcingSourceEntitlementVersion.findFirst.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      prisma.procurementTestIntent.create.mock.invocationCallOrder[0],
    );
  });

  it('recomputes immutable launch quantity conversion before insert', async () => {
    const prisma = makePrisma();
    prisma.procurementTestIntent.findUnique.mockResolvedValue(null);
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'membership-1',
    });
    prisma.sourcingDecisionBatchItem.findFirst.mockResolvedValue(
      decisionItem({
        launchCandidate: {
          id: 'launch-1',
          supplierOfferSkuSnapshotId: 'snapshot-1',
          initialOrderQuantity: 12,
          unitsPerSellableBundle: 6,
        },
      }),
    );
    const adapter = new SupplySourcingProcurementRepositoryAdapter(
      prisma as never,
    );

    await expect(
      adapter.createTestIntent('org-1', intentRecord()),
    ).resolves.toEqual({ kind: 'quantity_conservation_mismatch' });
    expect(prisma.procurementTestIntent.create).not.toHaveBeenCalled();
  });

  it('revalidates decision artifact, expiry, rejection, and test-order eligibility', async () => {
    const makeReadyPrisma = () => {
      const prisma = makePrisma();
      prisma.procurementTestIntent.findUnique.mockResolvedValue(null);
      prisma.organizationMembership.findFirst.mockResolvedValue({
        id: 'membership-1',
      });
      return prisma;
    };

    const artifactPrisma = makeReadyPrisma();
    const artifactAdapter = new SupplySourcingProcurementRepositoryAdapter(
      artifactPrisma as never,
    );
    await expect(
      artifactAdapter.createTestIntent(
        'org-1',
        intentRecord({ sourceRecommendationArtifactId: 'decision-other' }),
      ),
    ).resolves.toEqual({ kind: 'decision_artifact_mismatch' });

    const expiredPrisma = makeReadyPrisma();
    expiredPrisma.sourcingDecisionBatchItem.findFirst.mockResolvedValue(
      decisionItem({
        decisionBatch: {
          status: 'active',
          expiresAt: new Date('2000-01-01T00:00:00.000Z'),
        },
      }),
    );
    const expiredAdapter = new SupplySourcingProcurementRepositoryAdapter(
      expiredPrisma as never,
    );
    await expect(
      expiredAdapter.createTestIntent('org-1', intentRecord()),
    ).resolves.toEqual({ kind: 'decision_batch_expired' });

    const referencePrisma = makeReadyPrisma();
    referencePrisma.sourcingDecisionBatchItem.findFirst.mockResolvedValue(
      decisionItem({ launchCandidateId: 'launch-other' }),
    );
    const referenceAdapter = new SupplySourcingProcurementRepositoryAdapter(
      referencePrisma as never,
    );
    await expect(
      referenceAdapter.createTestIntent('org-1', intentRecord()),
    ).resolves.toEqual({ kind: 'decision_reference_mismatch' });

    const rejectedPrisma = makeReadyPrisma();
    rejectedPrisma.sourcingDecisionBatchItem.findFirst.mockResolvedValue(
      decisionItem({ decision: 'reject', executionEligible: false }),
    );
    const rejectedAdapter = new SupplySourcingProcurementRepositoryAdapter(
      rejectedPrisma as never,
    );
    await expect(
      rejectedAdapter.createTestIntent('org-1', intentRecord()),
    ).resolves.toEqual({ kind: 'decision_rejected' });

    const inactivePrisma = makeReadyPrisma();
    inactivePrisma.sourcingDecisionBatchItem.findFirst.mockResolvedValue(
      decisionItem({
        decisionBatch: {
          status: 'superseded',
          expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        },
      }),
    );
    const inactiveAdapter = new SupplySourcingProcurementRepositoryAdapter(
      inactivePrisma as never,
    );
    await expect(
      inactiveAdapter.createTestIntent('org-1', intentRecord()),
    ).resolves.toEqual({ kind: 'decision_batch_not_active' });

    const holdPrisma = makeReadyPrisma();
    holdPrisma.sourcingDecisionBatchItem.findFirst.mockResolvedValue(
      decisionItem({ decision: 'hold', executionEligible: false }),
    );
    const holdAdapter = new SupplySourcingProcurementRepositoryAdapter(
      holdPrisma as never,
    );
    await expect(
      holdAdapter.createTestIntent('org-1', intentRecord()),
    ).resolves.toEqual({ kind: 'decision_not_execution_eligible' });
  });

  it('always scopes intent reads and filters to organization', async () => {
    const prisma = makePrisma();
    prisma.procurementTestIntent.findMany.mockResolvedValue([]);
    prisma.procurementTestIntent.count.mockResolvedValue(0);
    const adapter = new SupplySourcingProcurementRepositoryAdapter(
      prisma as never,
    );

    await adapter.listTestIntents({
      organizationId: 'org-1',
      page: 2,
      limit: 25,
      intentType: 'request_sample',
      status: 'proposed',
    });

    expect(prisma.procurementTestIntent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          kind: 'request_sample',
          status: 'proposed',
        },
        skip: 25,
        take: 25,
      }),
    );
  });
});
