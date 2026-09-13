import { describe, expect, it } from 'vitest';
import {
  buildSourcingDecisionCenterViewModel,
  isoTimestampToMillis,
  resolveDecisionBatchState,
  resolveSourceEntitlementEligibility,
} from './sourcing-decision-center';
import type {
  ProcurementTestIntent,
  SourcingDecisionBatch,
  SourcingDecisionBatchItem,
  SourcingLaunchCandidate,
  SourcingSourceEntitlement,
  SupplierOfferSnapshot,
} from './sourcing-intelligence-api';

const NOW = '2026-08-02T00:00:00.000Z';

describe('sourcing decision center view model', () => {
  it('represents a null latest batch as an explicit empty state', () => {
    const result = buildSourcingDecisionCenterViewModel({
      sources: [source()],
      launchCandidates: [],
      latestBatch: null,
      supplierOffers: [],
      procurementIntents: [],
      now: NOW,
    });

    expect(result.batchState).toBe('missing');
    expect(result.latestBatch).toBeNull();
    expect(result.candidates).toEqual([]);
    expect(result.summary.decisionCandidateCount).toBe(0);
  });

  it('labels entitlement eligibility without claiming ingestion-run readiness', () => {
    expect(resolveSourceEntitlementEligibility(source(), NOW)).toEqual({
      eligibility: 'decision_eligible',
      blockReason: null,
    });
    expect(
      resolveSourceEntitlementEligibility(
        source({ lifecycle: 'shadow', decisionImpact: 'disabled' }),
        NOW,
      ),
    ).toEqual({
      eligibility: 'shadow_only',
      blockReason: 'decision_impact_disabled',
    });
    expect(
      resolveSourceEntitlementEligibility(
        source({ permissionExpiresAt: NOW }),
        NOW,
      ),
    ).toEqual({
      eligibility: 'blocked',
      blockReason: 'permission_expired',
    });
  });

  it('joins exact offers and launch candidates and chooses the latest ISO-dated intent', () => {
    const firstItem = decisionItem({ id: 'item-1', rank: 2 });
    const secondItem = decisionItem({
      id: 'item-2',
      rank: 1,
      canonicalDecision: 'reject',
      supplierOfferSkuSnapshotId: null,
      launchCandidateId: null,
    });
    const result = buildSourcingDecisionCenterViewModel({
      sources: [],
      launchCandidates: [launchCandidate()],
      latestBatch: decisionBatch({ items: [firstItem, secondItem] }),
      supplierOffers: [offer()],
      procurementIntents: [
        procurementIntent({ id: 'intent-old', createdAt: '2026-08-01T01:00:00.000Z' }),
        procurementIntent({ id: 'intent-new', createdAt: '2026-08-01T02:00:00.000Z' }),
      ],
      procurementIntentTotal: 240,
      now: NOW,
    });

    expect(result.batchState).toBe('investigation');
    expect(result.candidates.map(({ id }) => id)).toEqual(['item-2', 'item-1']);
    expect(result.candidates[1]).toMatchObject({
      offer: { id: 'offer-1' },
      launchCandidate: { id: 'launch-1' },
      latestIntent: { id: 'intent-new' },
      canRequestRfq: true,
      canRequestSample: true,
    });
    expect(result.candidates[0]).toMatchObject({
      canRequestRfq: false,
      canRequestSample: false,
      actionBlockReasons: [
        'recommendation_rejected',
        'supplier_offer_missing',
      ],
    });
    expect(result.summary).toMatchObject({
      decisionCandidateCount: 2,
      holdCount: 1,
      rejectCount: 1,
      proposedIntentCount: 240,
    });
  });

  it('keeps RFQ available but blocks samples explicitly when the supplier disallows samples', () => {
    const result = buildSourcingDecisionCenterViewModel({
      sources: [],
      launchCandidates: [launchCandidate()],
      latestBatch: decisionBatch(),
      supplierOffers: [offer({ sampleAvailable: false })],
      procurementIntents: [],
      now: NOW,
    });

    expect(result.candidates[0]).toMatchObject({
      canRequestRfq: true,
      canRequestSample: false,
      actionBlockReasons: ['supplier_sample_unavailable'],
    });
  });

  it('treats unknown sample availability as requestable after exact variant matching', () => {
    const result = buildSourcingDecisionCenterViewModel({
      sources: [],
      launchCandidates: [launchCandidate()],
      latestBatch: decisionBatch(),
      supplierOffers: [offer({ sampleAvailable: null })],
      procurementIntents: [],
      now: NOW,
    });

    expect(result.candidates[0]).toMatchObject({
      canRequestRfq: true,
      canRequestSample: true,
      actionBlockReasons: [],
    });
  });

  it('treats an ISO expiry equal to now as expired and rejects invalid timestamps', () => {
    expect(resolveDecisionBatchState(decisionBatch({ expiresAt: NOW }), NOW)).toBe(
      'expired',
    );
    expect(isoTimestampToMillis('2026-08-02T09:00:00+09:00')).toBe(
      Date.parse(NOW),
    );
    expect(isoTimestampToMillis('not-a-date')).toBeNull();
    expect(() =>
      buildSourcingDecisionCenterViewModel({
        sources: [],
        launchCandidates: [],
        latestBatch: null,
        supplierOffers: [],
        procurementIntents: [],
        now: 'not-a-date',
      }),
    ).toThrow(TypeError);
  });

  it('survives a batch whose timestamps are absent instead of null', () => {
    // 빈 본문 200 을 apiClient 가 `{}` 로 만들면 필수 필드가 undefined 로 도착한다.
    expect(isoTimestampToMillis(undefined)).toBeNull();
    expect(
      resolveDecisionBatchState(
        { ...decisionBatch(), expiresAt: undefined } as unknown as SourcingDecisionBatch,
        NOW,
      ),
    ).toBe('expired');
  });

  describe('batchSourceCoverage', () => {
    // 서버는 키워드 단위 coverage 를 한 번 계산해 배치의 모든 후보에 복사한다.
    // 후보 지표가 아니므로 균일할 때만 배치 지표로 인정한다.
    it('모든 후보가 같은 coverage 를 공유하면 배치 지표로 인정한다', () => {
      const result = buildSourcingDecisionCenterViewModel({
        sources: [],
        launchCandidates: [],
        latestBatch: decisionBatch({
          items: [
            decisionItem({ id: 'item-1', rank: 1, confidence: 0.83 }),
            decisionItem({ id: 'item-2', rank: 2, confidence: 0.83 }),
          ],
        }),
        supplierOffers: [],
        procurementIntents: [],
        now: NOW,
      });

      expect(result.batchSourceCoverage).toBe(0.83);
    });

    it('후보마다 값이 다르면 배치 지표로 쓰지 않는다', () => {
      const result = buildSourcingDecisionCenterViewModel({
        sources: [],
        launchCandidates: [],
        latestBatch: decisionBatch({
          items: [
            decisionItem({ id: 'item-1', rank: 1, confidence: 0.83 }),
            decisionItem({ id: 'item-2', rank: 2, confidence: 0.5 }),
          ],
        }),
        supplierOffers: [],
        procurementIntents: [],
        now: NOW,
      });

      expect(result.batchSourceCoverage).toBeNull();
    });

    it('후보가 없거나 값이 비정상이면 null 이다', () => {
      const empty = buildSourcingDecisionCenterViewModel({
        sources: [],
        launchCandidates: [],
        latestBatch: null,
        supplierOffers: [],
        procurementIntents: [],
        now: NOW,
      });
      expect(empty.batchSourceCoverage).toBeNull();

      const malformed = buildSourcingDecisionCenterViewModel({
        sources: [],
        launchCandidates: [],
        latestBatch: decisionBatch({
          items: [decisionItem({ confidence: 1.4 })],
        }),
        supplierOffers: [],
        procurementIntents: [],
        now: NOW,
      });
      expect(malformed.batchSourceCoverage).toBeNull();
    });
  });
});

function source(
  overrides: Partial<SourcingSourceEntitlement> = {},
): SourcingSourceEntitlement {
  return {
    id: 'source-1',
    organizationId: 'organization-1',
    sourceKey: '1688.offer',
    scopeKey: 'default',
    version: 1,
    versionHash: 'hash',
    lifecycle: 'qualified',
    decisionImpact: 'enabled',
    ownerLabel: '1688 offer collector',
    legalBasis: 'approved API agreement',
    allowedMethod: 'api',
    credentialRef: 'secret:1688',
    permittedFields: ['offerId'],
    prohibitedUses: [],
    rateLimitValue: 10,
    rateLimitWindowSeconds: 60,
    geographyCoverage: ['CN'],
    coverageDefinition: 'eligible offers observed',
    accountCoverage: 'approved account',
    searchCoverage: 'stationery and toy queries',
    categoryCoverage: 'stationery,toy',
    denominatorDefinition: 'scheduled eligible offers',
    historyBackfill: 'none',
    expectedDelayMinutes: 30,
    maxStalenessMinutes: 120,
    minimumCoverageBps: 8_000,
    revisionPolicy: 'append correction revision',
    retentionDays: 90,
    permissionStartsAt: '2026-08-01T00:00:00.000Z',
    permissionExpiresAt: '2026-09-01T00:00:00.000Z',
    killSwitch: false,
    reviewNote: null,
    reviewedByUserId: 'user-1',
    reviewedAt: '2026-08-01T00:00:00.000Z',
    retiredAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function decisionItem(
  overrides: Partial<SourcingDecisionBatchItem> = {},
): SourcingDecisionBatchItem {
  return {
    id: 'item-1',
    organizationId: 'organization-1',
    decisionBatchId: 'batch-1',
    modelCandidateId: 'model-candidate-1',
    rank: 1,
    productName: '자석 블록',
    supplierOfferSkuSnapshotId: 'offer-1',
    launchCandidateId: 'launch-1',
    baselineDecision: 'observe_3d',
    canonicalDecision: 'hold',
    executionEligible: false,
    baselineScore: 78,
    confidence: 0.67,
    confidenceKind: 'coverage',
    evidenceFamilyCount: 3,
    evidencePlatformCount: 2,
    hasCoupangEvidence: true,
    has1688Evidence: true,
    nextEvidenceAction: 'obtain_calibrated_probability',
    reasonCodes: ['calibrated_probability_missing'],
    riskCodes: [],
    modelOutput: {},
    createdAt: '2026-08-01T00:00:00.000Z',
    evidence: [],
    ...overrides,
  };
}

function decisionBatch(
  overrides: Partial<SourcingDecisionBatch> = {},
): SourcingDecisionBatch {
  return {
    id: 'batch-1',
    organizationId: 'organization-1',
    batchKey: 'shadow-1',
    requestHash: 'request-hash',
    status: 'shadow',
    keyword: '문구',
    category: '완구',
    policyVersion: 'phase0.v1',
    modelPipeline: '1688_first_new_product_validation',
    modelVersion: '1',
    modelGeneratorVersion: 'generator-1',
    decisionAt: '2026-08-01T00:00:00.000Z',
    sourceCutoffAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2026-08-03T00:00:00.000Z',
    createdByUserId: 'user-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    items: [decisionItem()],
    ...overrides,
  };
}

function offer(
  overrides: Partial<SupplierOfferSnapshot> = {},
): SupplierOfferSnapshot {
  return {
    id: 'offer-1',
    organizationId: 'organization-1',
    evidenceObservationId: 'observation-1',
    supplierId: null,
    supplierName: 'Yiwu Top Toy',
    identityStatus: 'exact_variant',
    sourcePlatform: '1688',
    sourceUrl: 'https://detail.1688.com/offer/1.html',
    externalSupplierKey: 'supplier-1',
    externalOfferId: 'external-offer-1',
    externalSkuId: 'sku-red',
    variantKey: 'red-carton',
    productName: 'Magnetic blocks',
    variantName: 'Red carton',
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
    grossWeightGrams: 2_500,
    lengthMm: 300,
    widthMm: 200,
    heightMm: 100,
    material: 'ABS',
    packCount: 24,
    capturedAt: '2026-08-01T00:00:00.000Z',
    validUntil: '2026-09-01T00:00:00.000Z',
    snapshotHash: 'snapshot-hash',
    priceTiers: [
      {
        id: 'tier-1',
        minQuantity: 10,
        maxQuantity: 49,
        unitPriceCny: '12.30',
      },
    ],
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function launchCandidate(
  overrides: Partial<SourcingLaunchCandidate> = {},
): SourcingLaunchCandidate {
  return {
    id: 'launch-1',
    organizationId: 'organization-1',
    candidateKey: 'candidate-key',
    version: 1,
    identityHash: 'identity-hash',
    sourceCandidateId: null,
    supplierOfferSkuSnapshotId: 'offer-1',
    targetChannelAccountId: 'channel-1',
    productConceptVersionKey: 'magnetic-blocks:v1',
    title: '자석 블록',
    koreanSellableBundleVersionKey: 'bundle:v1',
    unitsPerSellableBundle: 6,
    initialOrderQuantity: 10,
    targetSalePriceKrw: 19_900,
    fulfillmentMode: 'rocket_growth',
    intendedAgeMinMonths: 36,
    intendedAgeMaxMonths: null,
    intendedUse: 'toy',
    materialProfileKey: 'abs',
    labelingProfileKey: 'toy-ko',
    launchPlanVersion: 'launch-v1',
    complianceAssessmentVersion: 'compliance-v1',
    qualitySpecVersion: 'quality-v1',
    ipAssessmentVersion: 'ip-v1',
    economicsStatus: 'known',
    complianceStatus: 'passed',
    qualityStatus: 'passed',
    ipStatus: 'passed',
    landedCostKrw: 5_000,
    profitP10Krw: 4_000,
    blockingRiskCodes: [],
    unknownRiskCodes: [],
    bundleSnapshot: {},
    launchPlanSnapshot: {},
    economicsSnapshot: {},
    complianceSnapshot: {},
    qualitySnapshot: {},
    ipSnapshot: {},
    validUntil: '2026-09-01T00:00:00.000Z',
    createdByUserId: 'user-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function procurementIntent(
  overrides: Partial<ProcurementTestIntent> = {},
): ProcurementTestIntent {
  return {
    id: 'intent-1',
    organizationId: 'organization-1',
    decisionBatchItemId: 'item-1',
    launchCandidateId: 'launch-1',
    supplierOfferSkuSnapshotId: 'offer-1',
    selectedPriceTierId: null,
    sourceRecommendationArtifactId: 'item-1',
    requestedByUserId: 'user-1',
    reviewedByUserId: null,
    intentType: 'request_rfq',
    status: 'proposed',
    idempotencyKey: 'intent-key',
    requestHash: 'request-hash',
    requestedPurchaseUnits: null,
    unitsPerPurchaseUnit: null,
    unitsPerSellableBundle: null,
    requestedSellableUnits: null,
    selectedUnitPriceCny: null,
    expectedGoodsTotalCny: null,
    currency: null,
    expiresAt: null,
    reviewedAt: null,
    reviewReason: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    supplierOfferSkuSnapshot: offer(),
    ...overrides,
  };
}
