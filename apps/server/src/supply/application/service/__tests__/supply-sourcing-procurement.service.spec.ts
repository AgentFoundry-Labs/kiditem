import { describe, expect, it, vi } from 'vitest';
import { SupplySourcingProcurementService } from '../supply-sourcing-procurement.service';
import {
  buildProcurementTestIntentRequestHash,
  resolveProcurementTestIntentSelection,
} from '../../../domain/policy/sourcing-procurement';
import type {
  ProcurementTestIntentView,
  SupplierOfferSnapshotView,
} from '../../port/in/procurement/supply-sourcing-procurement.port';
import type {
  ProcurementDecisionContextView,
  SupplySourcingProcurementRepositoryPort,
} from '../../port/out/repository/supply-sourcing-procurement.repository.port';

const NOW = new Date('2026-08-01T00:00:00.000Z');

function snapshot(
  overrides: Partial<SupplierOfferSnapshotView> = {},
): SupplierOfferSnapshotView {
  return {
    id: '00000000-0000-4000-8000-000000000101',
    organizationId: '00000000-0000-4000-8000-000000000001',
    evidenceObservationId: '00000000-0000-4000-8000-000000000201',
    supplierId: null,
    supplierName: 'Yiwu Top Toy',
    identityStatus: 'exact_variant',
    sourcePlatform: '1688',
    sourceUrl: 'https://detail.1688.com/offer/1.html',
    externalSupplierKey: 'supplier-1',
    externalOfferId: 'offer-1',
    externalSkuId: 'sku-red',
    variantKey: 'color:red',
    productName: 'Magnetic blocks',
    variantName: 'Red / carton of 24',
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
    validUntil: new Date('2099-08-10T00:00:00.000Z'),
    snapshotHash: 'a'.repeat(64),
    priceTiers: [
      {
        id: '00000000-0000-4000-8000-000000000301',
        minQuantity: 10,
        maxQuantity: 49,
        unitPriceCny: '12.30',
      },
    ],
    createdAt: NOW,
    ...overrides,
  };
}

function intent(
  overrides: Partial<ProcurementTestIntentView> = {},
): ProcurementTestIntentView {
  return {
    id: '00000000-0000-4000-8000-000000000401',
    organizationId: '00000000-0000-4000-8000-000000000001',
    decisionBatchItemId: '00000000-0000-4000-8000-000000000501',
    launchCandidateId: '00000000-0000-4000-8000-000000000601',
    supplierOfferSkuSnapshotId: '00000000-0000-4000-8000-000000000101',
    selectedPriceTierId: '00000000-0000-4000-8000-000000000301',
    sourceRecommendationArtifactId:
      '00000000-0000-4000-8000-000000000501',
    requestedByUserId: '00000000-0000-4000-8000-000000000701',
    reviewedByUserId: null,
    intentType: 'test_order',
    status: 'proposed',
    idempotencyKey: 'intent-key-1',
    requestHash: 'b'.repeat(64),
    requestedPurchaseUnits: 10,
    unitsPerPurchaseUnit: 24,
    unitsPerSellableBundle: 6,
    requestedSellableUnits: 40,
    selectedUnitPriceCny: '12.30',
    expectedGoodsTotalCny: '123.00',
    currency: 'CNY',
    expiresAt: new Date('2099-08-10T00:00:00.000Z'),
    reviewedAt: null,
    reviewReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function decisionContext(
  overrides: Partial<ProcurementDecisionContextView> = {},
): ProcurementDecisionContextView {
  return {
    decisionBatchItemId: 'decision-1',
    supplierOfferSkuSnapshotId: snapshot().id,
    launchCandidateId: 'launch-1',
    launchCandidate: {
      id: 'launch-1',
      supplierOfferSkuSnapshotId: snapshot().id,
      initialOrderQuantity: 10,
      unitsPerSellableBundle: 6,
    },
    decision: 'test_order',
    executionEligible: true,
    decisionBatchStatus: 'active',
    decisionBatchExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function repository(
  overrides: Partial<SupplySourcingProcurementRepositoryPort> = {},
) {
  return {
    createOfferSnapshot: vi.fn(),
    findOfferSnapshot: vi.fn().mockResolvedValue(snapshot()),
    findProcurementDecisionContext: vi.fn().mockResolvedValue(decisionContext()),
    listOfferSnapshots: vi.fn(),
    createTestIntent: vi.fn().mockImplementation(
      async (_organizationId: string, record: object) => ({
        kind: 'created' as const,
        intent: intent(record),
      }),
    ),
    findTestIntentByIdempotencyKey: vi.fn().mockResolvedValue(null),
    findTestIntent: vi.fn(),
    listTestIntents: vi.fn(),
    ...overrides,
  } as unknown as SupplySourcingProcurementRepositoryPort;
}

describe('SupplySourcingProcurementService', () => {
  it('creates an idempotent supplier offer snapshot with a server hash', async () => {
    const repo = repository({
      createOfferSnapshot: vi.fn().mockImplementation(
        async (organizationId: string, record: object) => ({
          kind: 'created' as const,
          snapshot: snapshot({ organizationId, ...record }),
        }),
      ),
    });
    const service = new SupplySourcingProcurementService(repo);

    const result = await service.createOfferSnapshot({
      organizationId: 'org-1',
      evidenceObservationId: 'observation-1',
      identityStatus: 'exact_variant',
      sourcePlatform: '1688',
      externalSupplierKey: 'supplier-1',
      externalOfferId: 'offer-1',
      externalSkuId: 'sku-red',
      variantKey: 'color:red',
      productName: 'Magnetic blocks',
      currency: 'CNY',
      orderUnit: 'carton',
      unitsPerOrderUnit: 24,
      minOrderQuantity: 10,
      capturedAt: NOW,
      priceTiers: [
        { minQuantity: 10, maxQuantity: 49, unitPriceCny: 12.3 },
      ],
    });

    expect(result.duplicate).toBe(false);
    expect(repo.createOfferSnapshot).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        sourcePlatform: '1688',
        productName: 'Magnetic blocks',
        priceTiers: [
          { minQuantity: 10, maxQuantity: 49, unitPriceCny: '12.30' },
        ],
      }),
    );
  });

  it('creates an offer-only RFQ without caller price or quantity', async () => {
    const repo = repository({
      findOfferSnapshot: vi.fn().mockResolvedValue(
        snapshot({
          identityStatus: 'offer_only',
          externalSkuId: null,
          minOrderQuantity: null,
          priceTiers: [],
        }),
      ),
      findProcurementDecisionContext: vi.fn().mockResolvedValue(
        decisionContext({
          launchCandidateId: null,
          launchCandidate: null,
          decision: 'hold',
          executionEligible: false,
        }),
      ),
    });
    const service = new SupplySourcingProcurementService(repo);

    await service.createTestIntent({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'rfq-1',
      intentType: 'request_rfq',
      sourceRecommendationArtifactId: 'decision-1',
      decisionBatchItemId: 'decision-1',
      supplierOfferSkuSnapshotId: snapshot().id,
    });

    expect(repo.createTestIntent).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        status: 'proposed',
        selectedPriceTierId: null,
        requestedPurchaseUnits: null,
        unitsPerSellableBundle: null,
        requestedSellableUnits: null,
        selectedUnitPriceCny: null,
        expectedGoodsTotalCny: null,
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(repo.findProcurementDecisionContext).toHaveBeenCalledWith(
      'org-1',
      'decision-1',
    );
  });

  it('uses snapshot tier price and conversion for a test-order total', async () => {
    const repo = repository();
    const service = new SupplySourcingProcurementService(repo);

    await service.createTestIntent({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'test-order-1',
      intentType: 'test_order',
      sourceRecommendationArtifactId: 'decision-1',
      decisionBatchItemId: 'decision-1',
      supplierOfferSkuSnapshotId: snapshot().id,
      launchCandidateId: 'launch-1',
      selectedPriceTierId: snapshot().priceTiers[0].id,
    });

    expect(repo.createTestIntent).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        selectedUnitPriceCny: '12.30',
        expectedGoodsTotalCny: '123.00',
        requestedPurchaseUnits: 10,
        unitsPerPurchaseUnit: 24,
        unitsPerSellableBundle: 6,
        requestedSellableUnits: 40,
      }),
    );
  });

  it('rejects quantity below MOQ without writing or changing it', async () => {
    const belowMoq = decisionContext();
    const repo = repository({
      findProcurementDecisionContext: vi.fn().mockResolvedValue({
        ...belowMoq,
        launchCandidate: {
          ...belowMoq.launchCandidate!,
          initialOrderQuantity: 6,
        },
      }),
    });
    const service = new SupplySourcingProcurementService(repo);

    await expect(
      service.createTestIntent({
        organizationId: 'org-1',
        requestedByUserId: 'user-1',
        idempotencyKey: 'test-order-1',
        intentType: 'test_order',
        sourceRecommendationArtifactId: 'decision-1',
        decisionBatchItemId: 'decision-1',
        supplierOfferSkuSnapshotId: snapshot().id,
        launchCandidateId: 'launch-1',
        selectedPriceTierId: snapshot().priceTiers[0].id,
        requestedPurchaseUnits: 6,
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { reason: 'minimum_order_quantity_not_met' },
    });
    expect(repo.createTestIntent).not.toHaveBeenCalled();
  });

  it('turns a structural idempotency hash mismatch into conflict', async () => {
    const repo = repository({
      createTestIntent: vi.fn().mockResolvedValue({ kind: 'idempotency_conflict' }),
    });
    const service = new SupplySourcingProcurementService(repo);

    await expect(
      service.createTestIntent({
        organizationId: 'org-1',
        requestedByUserId: 'user-1',
        idempotencyKey: 'test-order-1',
        intentType: 'test_order',
        sourceRecommendationArtifactId: 'decision-1',
        decisionBatchItemId: 'decision-1',
        supplierOfferSkuSnapshotId: snapshot().id,
        launchCandidateId: 'launch-1',
        selectedPriceTierId: snapshot().priceTiers[0].id,
        requestedPurchaseUnits: 10,
      }),
    ).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'IDEMPOTENCY_KEY_REUSED' } });
  });

  it('returns an existing duplicate before applying current offer expiry', async () => {
    const expiredSnapshot = snapshot({
      validUntil: new Date('2000-01-01T00:00:00.000Z'),
    });
    const selection = resolveProcurementTestIntentSelection({
      snapshot: {
        ...expiredSnapshot,
        minOrderQuantity: expiredSnapshot.minOrderQuantity,
      },
      decisionContext: decisionContext(),
      selection: {
        intentType: 'test_order',
        sourceRecommendationArtifactId: 'decision-1',
        decisionBatchItemId: 'decision-1',
        launchCandidateId: 'launch-1',
        selectedPriceTierId: expiredSnapshot.priceTiers[0].id,
        requestedPurchaseUnits: 10,
      },
      enforceOfferExpiry: false,
    });
    const existing = intent({
      decisionBatchItemId: 'decision-1',
      sourceRecommendationArtifactId: 'decision-1',
      launchCandidateId: 'launch-1',
      supplierOfferSkuSnapshotId: expiredSnapshot.id,
      requestedByUserId: 'user-1',
      idempotencyKey: 'test-order-1',
      requestHash: buildProcurementTestIntentRequestHash({
        supplierOfferSkuSnapshotId: expiredSnapshot.id,
        supplierOfferSnapshotHash: expiredSnapshot.snapshotHash,
        selection,
      }),
      supplierOfferSkuSnapshot: expiredSnapshot,
    });
    const repo = repository({
      findTestIntentByIdempotencyKey: vi.fn().mockResolvedValue(existing),
      createTestIntent: vi.fn().mockResolvedValue({
        kind: 'duplicate',
        intent: existing,
      }),
    });
    const service = new SupplySourcingProcurementService(repo);

    await expect(service.createTestIntent({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'test-order-1',
      intentType: 'test_order',
      sourceRecommendationArtifactId: 'decision-1',
      decisionBatchItemId: 'decision-1',
      supplierOfferSkuSnapshotId: expiredSnapshot.id,
      launchCandidateId: 'launch-1',
      selectedPriceTierId: expiredSnapshot.priceTiers[0].id,
      requestedPurchaseUnits: 10,
    })).resolves.toMatchObject({ duplicate: true, intent: { id: existing.id } });
    expect(repo.findOfferSnapshot).not.toHaveBeenCalled();
    expect(repo.createTestIntent).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        requestHash: existing.requestHash,
        unitsPerSellableBundle: 6,
      }),
    );
  });

  it('refuses a replayed idempotency key whose request changed with the idempotency conflict code', async () => {
    const existing = intent({
      requestedByUserId: 'user-1',
      idempotencyKey: 'test-order-1',
      supplierOfferSkuSnapshot: snapshot(),
    });
    const replay = (requestedPurchaseUnits: number) => new SupplySourcingProcurementService(repository({
      findTestIntentByIdempotencyKey: vi.fn().mockResolvedValue(existing),
    })).createTestIntent({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'test-order-1',
      intentType: 'test_order',
      sourceRecommendationArtifactId: existing.sourceRecommendationArtifactId,
      decisionBatchItemId: existing.decisionBatchItemId,
      supplierOfferSkuSnapshotId: existing.supplierOfferSkuSnapshotId,
      launchCandidateId: existing.launchCandidateId,
      selectedPriceTierId: snapshot().priceTiers[0].id,
      requestedPurchaseUnits,
    });

    // 같은 선택이지만 저장된 요청 확인값과 다르다.
    await expect(replay(10)).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'IDEMPOTENCY_KEY_REUSED' } });
    // 저장된 결정으로는 풀 수 없는 선택(MOQ 미만)도 같은 요청 번호 재사용 충돌이다.
    await expect(replay(6)).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'IDEMPOTENCY_KEY_REUSED' } });
  });

  it('does not expose an existing idempotent intent to a different actor', async () => {
    const existing = intent({
      requestedByUserId: 'user-owner',
      supplierOfferSkuSnapshot: snapshot(),
    });
    const repo = repository({
      findTestIntentByIdempotencyKey: vi.fn().mockResolvedValue(existing),
    });
    const service = new SupplySourcingProcurementService(repo);

    await expect(service.createTestIntent({
      organizationId: 'org-1',
      requestedByUserId: 'user-other',
      idempotencyKey: 'intent-key-1',
      intentType: 'test_order',
      sourceRecommendationArtifactId: 'decision-1',
      decisionBatchItemId: 'decision-1',
      supplierOfferSkuSnapshotId: existing.supplierOfferSkuSnapshotId,
      launchCandidateId: 'launch-1',
      selectedPriceTierId: snapshot().priceTiers[0].id,
      requestedPurchaseUnits: 10,
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'IDEMPOTENCY_KEY_REUSED' } });
    expect(repo.findOfferSnapshot).not.toHaveBeenCalled();
    expect(repo.createTestIntent).not.toHaveBeenCalled();
  });

  it('passes organization-scoped filters and bounded pagination', async () => {
    const repo = repository({
      listTestIntents: vi.fn().mockResolvedValue({
        items: [], total: 0, page: 2, limit: 25,
      }),
    });
    const service = new SupplySourcingProcurementService(repo);

    await service.listTestIntents({
      organizationId: 'org-1',
      page: 2,
      limit: 25,
      intentType: 'request_sample',
      status: 'proposed',
    });

    expect(repo.listTestIntents).toHaveBeenCalledWith({
      organizationId: 'org-1',
      page: 2,
      limit: 25,
      intentType: 'request_sample',
      status: 'proposed',
    });
  });
});
