import { describe, expect, it } from 'vitest';
import {
  buildProcurementTestIntentRequestHash,
  buildCanonicalSupplierOfferEvidencePayload,
  buildSupplierOfferSnapshotHash,
  evaluateSupplySourceEligibility,
  resolveProcurementTestIntentSelection,
  type ProcurementDecisionContextPolicyRecord,
  type SupplierOfferSnapshotPolicyRecord,
} from '../sourcing-procurement';

const exactSnapshot: SupplierOfferSnapshotPolicyRecord = {
  id: 'offer-snapshot-1',
  snapshotHash: 'snapshot-hash-1',
  identityStatus: 'exact_variant',
  minOrderQuantity: 10,
  currency: 'CNY',
  orderUnit: 'carton',
  unitsPerOrderUnit: 24,
  samplePriceCny: '18.00',
  validUntil: new Date('2026-08-10T00:00:00.000Z'),
  priceTiers: [
    { id: 'tier-1', minQuantity: 10, maxQuantity: 49, unitPriceCny: '12.30' },
    { id: 'tier-2', minQuantity: 50, maxQuantity: null, unitPriceCny: '10.00' },
  ],
};

function decisionContext(
  launchCandidate: ProcurementDecisionContextPolicyRecord['launchCandidate'] = null,
): ProcurementDecisionContextPolicyRecord {
  return {
    decisionBatchItemId: 'batch-item-1',
    supplierOfferSkuSnapshotId: exactSnapshot.id,
    launchCandidateId: launchCandidate?.id ?? null,
    launchCandidate,
  };
}

const launchCandidate = {
  id: 'launch-1',
  supplierOfferSkuSnapshotId: exactSnapshot.id,
  initialOrderQuantity: 10,
  unitsPerSellableBundle: 6,
};

function snapshotHashInput() {
  return {
    evidenceObservationId: 'observation-1',
    identityStatus: 'exact_variant' as const,
    sourcePlatform: '1688',
    externalSupplierKey: 'supplier-1688-1',
    externalOfferId: 'offer-1',
    externalSkuId: 'sku-red',
    variantKey: 'color:red|pack:24',
    productName: 'Magnetic blocks',
    currency: 'CNY',
    orderUnit: 'carton',
    unitsPerOrderUnit: 24,
    minOrderQuantity: 10,
    capturedAt: new Date('2026-08-01T00:00:00.000Z'),
    validUntil: new Date('2026-08-10T00:00:00.000Z'),
    priceTiers: [
      { minQuantity: 50, unitPriceCny: 10 },
      { minQuantity: 10, maxQuantity: 49, unitPriceCny: 12.3 },
    ],
  };
}

describe('sourcing procurement policy', () => {
  it('builds a stable supplier snapshot hash regardless of price-tier order', () => {
    const base = snapshotHashInput();
    expect(buildSupplierOfferSnapshotHash(base)).toBe(
      buildSupplierOfferSnapshotHash({
        ...base,
        priceTiers: [...base.priceTiers].reverse(),
      }),
    );
    expect(buildSupplierOfferSnapshotHash(base)).not.toBe(
      buildSupplierOfferSnapshotHash({ ...base, unitsPerOrderUnit: 12 }),
    );
  });

  it('allows an offer-only RFQ without quantity or price', () => {
    const resolved = resolveProcurementTestIntentSelection({
      snapshot: {
        ...exactSnapshot,
        identityStatus: 'offer_only',
        minOrderQuantity: null,
        priceTiers: [],
      },
      decisionContext: decisionContext(),
      selection: {
        intentType: 'request_rfq',
        sourceRecommendationArtifactId: 'batch-item-1',
        decisionBatchItemId: 'batch-item-1',
      },
    });
    expect(resolved).toMatchObject({
      intentType: 'request_rfq',
      requestedPurchaseUnits: null,
      selectedPriceTierId: null,
      selectedUnitPriceCny: null,
      expectedGoodsTotalCny: null,
    });
  });

  it('requires every intent to reference the same decision item as its source artifact', () => {
    expect(() =>
      resolveProcurementTestIntentSelection({
        snapshot: exactSnapshot,
        decisionContext: decisionContext(),
        selection: {
          intentType: 'request_rfq',
          sourceRecommendationArtifactId: 'batch-item-1',
        } as never,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'decision_batch_item_required' }),
    );

    expect(() =>
      resolveProcurementTestIntentSelection({
        snapshot: exactSnapshot,
        decisionContext: decisionContext(),
        selection: {
          intentType: 'request_rfq',
          sourceRecommendationArtifactId: 'batch-item-other',
          decisionBatchItemId: 'batch-item-1',
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'decision_artifact_mismatch' }));
  });

  it('requires exact identity and a positive quantity for a sample', () => {
    expect(() =>
      resolveProcurementTestIntentSelection({
        snapshot: { ...exactSnapshot, identityStatus: 'offer_only' },
        decisionContext: decisionContext(),
        selection: {
          intentType: 'request_sample',
          sourceRecommendationArtifactId: 'batch-item-1',
          decisionBatchItemId: 'batch-item-1',
          requestedPurchaseUnits: 1,
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'exact_variant_required' }));

    expect(() =>
      resolveProcurementTestIntentSelection({
        snapshot: exactSnapshot,
        decisionContext: decisionContext(),
        selection: {
          intentType: 'request_sample',
          sourceRecommendationArtifactId: 'batch-item-1',
          decisionBatchItemId: 'batch-item-1',
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'positive_quantity_required' }));
  });

  it('uses the sample quote when a sample has no selected quantity tier', () => {
    expect(
      resolveProcurementTestIntentSelection({
        snapshot: exactSnapshot,
        decisionContext: decisionContext(),
        selection: {
          intentType: 'request_sample',
          sourceRecommendationArtifactId: 'batch-item-1',
          decisionBatchItemId: 'batch-item-1',
          requestedPurchaseUnits: 1,
        },
      }),
    ).toMatchObject({
      selectedUnitPriceCny: '18.00',
      expectedGoodsTotalCny: '18.00',
      unitsPerSellableBundle: null,
      requestedSellableUnits: null,
    });
  });

  it('rejects a test quantity below MOQ instead of silently raising it', () => {
    const belowMoqLaunch = { ...launchCandidate, initialOrderQuantity: 6 };
    expect(() =>
      resolveProcurementTestIntentSelection({
        snapshot: exactSnapshot,
        decisionContext: decisionContext(belowMoqLaunch),
        selection: {
          intentType: 'test_order',
          sourceRecommendationArtifactId: 'batch-item-1',
          decisionBatchItemId: 'batch-item-1',
          launchCandidateId: 'launch-1',
          selectedPriceTierId: 'tier-1',
          requestedPurchaseUnits: 6,
        },
        now: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'minimum_order_quantity_not_met' }),
    );
  });

  it('requires launch candidate, current snapshot, and matching tier for test order', () => {
    expect(() =>
      resolveProcurementTestIntentSelection({
        snapshot: exactSnapshot,
        decisionContext: decisionContext(),
        selection: {
          intentType: 'test_order',
          sourceRecommendationArtifactId: 'batch-item-1',
          decisionBatchItemId: 'batch-item-1',
          selectedPriceTierId: 'tier-1',
          requestedPurchaseUnits: 10,
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'launch_candidate_required' }));

    expect(() =>
      resolveProcurementTestIntentSelection({
        snapshot: exactSnapshot,
        decisionContext: decisionContext(launchCandidate),
        selection: {
          intentType: 'test_order',
          sourceRecommendationArtifactId: 'batch-item-1',
          decisionBatchItemId: 'batch-item-1',
          launchCandidateId: 'launch-1',
          selectedPriceTierId: 'tier-other',
          requestedPurchaseUnits: 10,
        },
        now: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'price_tier_not_found' }));

    expect(() =>
      resolveProcurementTestIntentSelection({
        snapshot: exactSnapshot,
        decisionContext: decisionContext(launchCandidate),
        selection: {
          intentType: 'test_order',
          sourceRecommendationArtifactId: 'batch-item-1',
          decisionBatchItemId: 'batch-item-1',
          launchCandidateId: 'launch-1',
          selectedPriceTierId: 'tier-1',
          requestedPurchaseUnits: 10,
        },
        now: new Date('2026-08-11T00:00:00.000Z'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'offer_snapshot_expired' }));
  });

  it('freezes server-owned price, conversions and expected total in request hash', () => {
    const selection = resolveProcurementTestIntentSelection({
      snapshot: exactSnapshot,
      decisionContext: decisionContext(launchCandidate),
      selection: {
        intentType: 'test_order',
        sourceRecommendationArtifactId: 'batch-item-1',
        launchCandidateId: 'launch-1',
        decisionBatchItemId: 'batch-item-1',
        selectedPriceTierId: 'tier-1',
      },
      now: new Date('2026-08-01T00:00:00.000Z'),
    });
    expect(selection).toMatchObject({
      selectedUnitPriceCny: '12.30',
      expectedGoodsTotalCny: '123.00',
      requestedPurchaseUnits: 10,
      unitsPerPurchaseUnit: 24,
      unitsPerSellableBundle: 6,
      requestedSellableUnits: 40,
      currency: 'CNY',
    });
    const hash = buildProcurementTestIntentRequestHash({
      supplierOfferSkuSnapshotId: exactSnapshot.id,
      supplierOfferSnapshotHash: exactSnapshot.snapshotHash,
      selection,
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(
      buildProcurementTestIntentRequestHash({
        supplierOfferSkuSnapshotId: exactSnapshot.id,
        supplierOfferSnapshotHash: exactSnapshot.snapshotHash,
        selection: { ...selection },
      }),
    );
    expect(hash).not.toBe(
      buildProcurementTestIntentRequestHash({
        supplierOfferSkuSnapshotId: exactSnapshot.id,
        supplierOfferSnapshotHash: exactSnapshot.snapshotHash,
        selection: { ...selection, unitsPerSellableBundle: 3 },
      }),
    );
  });

  it('requires test-order quantity to equal the launch plan and divide into bundles', () => {
    expect(() =>
      resolveProcurementTestIntentSelection({
        snapshot: exactSnapshot,
        decisionContext: decisionContext(launchCandidate),
        selection: {
          intentType: 'test_order',
          sourceRecommendationArtifactId: 'batch-item-1',
          decisionBatchItemId: 'batch-item-1',
          launchCandidateId: launchCandidate.id,
          selectedPriceTierId: 'tier-1',
          requestedPurchaseUnits: 11,
        },
        now: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'launch_initial_order_quantity_mismatch' }),
    );

    expect(() =>
      resolveProcurementTestIntentSelection({
        snapshot: { ...exactSnapshot, unitsPerOrderUnit: 25 },
        decisionContext: decisionContext(launchCandidate),
        selection: {
          intentType: 'test_order',
          sourceRecommendationArtifactId: 'batch-item-1',
          decisionBatchItemId: 'batch-item-1',
          launchCandidateId: launchCandidate.id,
          selectedPriceTierId: 'tier-1',
          requestedPurchaseUnits: 10,
        },
        now: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'sellable_bundle_divisibility_required' }),
    );
  });

  it('allows a fact only while its operation is the current publication of its source target', () => {
    const publication = {
      operationId: 'operation-1',
      completedAt: new Date('2026-08-01T00:00:00.000Z'),
    };
    const at = new Date('2026-08-02T00:00:00.000Z');

    for (const usage of ['retain', 'test_order'] as const) {
      expect(
        evaluateSupplySourceEligibility({ usage, observationOperationId: 'operation-1', publication, at }),
      ).toEqual({ allowed: true, reason: null, coverageBps: null });
    }
  });

  it('denies a fact whose source target has no current publication or a newer one', () => {
    const at = new Date('2026-08-02T00:00:00.000Z');
    expect(
      evaluateSupplySourceEligibility({ usage: 'retain', observationOperationId: 'operation-1', publication: null, at }),
    ).toMatchObject({ allowed: false, reason: 'source_publication_not_current' });
    expect(
      evaluateSupplySourceEligibility({
        usage: 'retain',
        observationOperationId: 'operation-1',
        publication: { operationId: 'operation-2', completedAt: new Date('2026-08-01T00:00:00.000Z') },
        at,
      }),
    ).toMatchObject({ allowed: false, reason: 'source_publication_not_current' });
  });

  it('denies a publication completed after the evaluation time', () => {
    expect(
      evaluateSupplySourceEligibility({
        usage: 'retain',
        observationOperationId: 'operation-1',
        publication: { operationId: 'operation-1', completedAt: new Date('2026-08-03T00:00:00.000Z') },
        at: new Date('2026-08-02T00:00:00.000Z'),
      }),
    ).toMatchObject({ allowed: false, reason: 'source_publication_not_completed' });
  });

  it('rejects overlapping supplier price tiers', () => {
    const base = snapshotHashInput();
    expect(() =>
      buildSupplierOfferSnapshotHash({
        ...base,
        priceTiers: [
          { minQuantity: 10, maxQuantity: 50, unitPriceCny: 12.3 },
          { minQuantity: 50, unitPriceCny: 10 },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_offer_terms' }));
  });

  it('rejects values that exceed PostgreSQL Int or Decimal(12,2)', () => {
    expect(() =>
      buildSupplierOfferSnapshotHash({
        ...snapshotHashInput(),
        minOrderQuantity: 2_147_483_648,
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_offer_terms' }));

    expect(() =>
      resolveProcurementTestIntentSelection({
        snapshot: {
          ...exactSnapshot,
          unitsPerOrderUnit: 1,
          samplePriceCny: '9999999999.99',
        },
        decisionContext: decisionContext(),
        selection: {
          intentType: 'request_sample',
          sourceRecommendationArtifactId: 'batch-item-1',
          decisionBatchItemId: 'batch-item-1',
          requestedPurchaseUnits: 2,
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_offer_terms' }));
  });

  it('emits an explicit canonical supplierOffer evidence document', () => {
    expect(buildCanonicalSupplierOfferEvidencePayload(snapshotHashInput())).toEqual({
      supplierOffer: expect.objectContaining({
        externalOfferId: 'offer-1',
        externalSkuId: 'sku-red',
        variantKey: 'color:red|pack:24',
        minOrderQuantity: 10,
        priceTiers: [
          { minQuantity: 10, maxQuantity: 49, unitPriceCny: '12.30' },
          { minQuantity: 50, maxQuantity: null, unitPriceCny: '10.00' },
        ],
      }),
    });
  });

  it('treats a missing tier maximum as ending before the next threshold', () => {
    const thresholdSnapshot = {
      ...exactSnapshot,
      priceTiers: [
        { ...exactSnapshot.priceTiers[0], maxQuantity: null },
        exactSnapshot.priceTiers[1],
      ],
    };
    expect(() =>
      resolveProcurementTestIntentSelection({
        snapshot: thresholdSnapshot,
        decisionContext: decisionContext({
          ...launchCandidate,
          initialOrderQuantity: 50,
        }),
        selection: {
          intentType: 'test_order',
          sourceRecommendationArtifactId: 'batch-item-1',
          decisionBatchItemId: 'batch-item-1',
          launchCandidateId: 'launch-1',
          selectedPriceTierId: 'tier-1',
          requestedPurchaseUnits: 50,
        },
        now: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'quantity_outside_price_tier' }));

    expect(() =>
      buildSupplierOfferSnapshotHash({
        ...snapshotHashInput(),
        priceTiers: [
          { minQuantity: 10, unitPriceCny: 12.3 },
          { minQuantity: 50, unitPriceCny: 10 },
        ],
      }),
    ).not.toThrow();
  });
});
