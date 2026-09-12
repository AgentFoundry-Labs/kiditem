import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourcingDecisionBatchService } from '../sourcing-decision-batch.service';
import type { Sourcing1688NewProductCandidate } from '../../../domain/sourcing-1688-new-product-model';

const CANDIDATE: Sourcing1688NewProductCandidate = {
  id: 'offer-1',
  rank: 1,
  offerId: 'offer-1',
  title: '자석 필통',
  imageUrl: null,
  sourceUrl: 'https://detail.1688.com/offer/1.html',
  keyword: '필통',
  matchMethod: 'keyword',
  score: 82,
  grade: 'A',
  decision: 'order',
  components: {
    newProductSignal: 80,
    supplyQuality: 80,
    coupangMatch: 80,
    marketReaction: 80,
    threeDayValidation: 80,
    marginPotential: 80,
    riskPenalty: 0,
  },
  wholesale: {
    priceCny: 12,
    monthlySales: 1000,
    tradeScore: 4.8,
    repurchaseRate: '30%',
    supplierName: '义乌供应商',
    shippingFulfillmentRate: null,
    shippingPickupRate: null,
    serviceScore: 4.8,
    landedCostKrw: 5000,
    estimatedProfitKrw: 3000,
    estimatedMarginRate: 30,
    sourceDate: '2026-08-01',
  },
  matchedCoupang: {
    productId: 'coupang-1',
    productName: '자석 필통',
    primaryKeyword: '필통',
    score: 80,
    grade: 'A',
    salePrice: 12_900,
    salesLast3d: 20,
    salesLast28d: 100,
    reviews: 10,
    matchScore: 90,
  },
  reasons: ['cross_market_match'],
  risks: [],
  modelTags: ['1688', 'coupang'],
  sourceSnapshotId: 'snapshot-1',
  sourceDate: '2026-08-01',
};

describe('SourcingDecisionBatchService', () => {
  const discovery = { discover: vi.fn() };
  const sourceRegistry = { authorize: vi.fn() };
  const repository = {
    create: vi.fn(),
    findById: vi.fn(),
    findLatest: vi.fn(),
    findItemById: vi.fn(),
  };
  const evidenceRepository = {
    findObservationsByIds: vi.fn(),
    findLatestObservationRevisions: vi.fn(),
    findCandidateSupportingObservations: vi.fn(),
  };
  const launchCandidates = {
    findByIds: vi.fn(),
    findBySupplierOfferSnapshotIds: vi.fn(),
  };
  const supply = {
    findOfferSnapshot: vi.fn(),
    findOfferSnapshotsByExternalOffer: vi.fn(),
    createProcurementTestIntent: vi.fn(),
  };
  let service: SourcingDecisionBatchService;

  beforeEach(() => {
    vi.resetAllMocks();
    discovery.discover.mockResolvedValue({
      confidence: 1,
      dataGaps: [],
      supplierMatches: [CANDIDATE],
    });
    launchCandidates.findByIds.mockResolvedValue([]);
    launchCandidates.findBySupplierOfferSnapshotIds.mockResolvedValue([]);
    evidenceRepository.findObservationsByIds.mockResolvedValue([]);
    evidenceRepository.findLatestObservationRevisions.mockResolvedValue([]);
    evidenceRepository.findCandidateSupportingObservations.mockResolvedValue([]);
    supply.findOfferSnapshotsByExternalOffer.mockResolvedValue([]);
    repository.create.mockImplementation(async (command) => ({
      kind: 'created',
      duplicate: false,
      record: { id: 'batch-1', items: command.items },
    }));
    service = new SourcingDecisionBatchService(
      discovery as never,
      sourceRegistry as never,
      repository as never,
      evidenceRepository as never,
      launchCandidates as never,
      supply as never,
    );
  });

  describe('서버 파생 후보↔오퍼 바인딩', () => {
    it('클라이언트 바인딩이 없어도 외부 오퍼 식별자로 오퍼·출시후보·증거를 이어붙인다', async () => {
      const launch = {
        id: 'launch-1',
        supplierOfferSkuSnapshotId: 'offer-snapshot-1',
        productConceptVersionKey: 'concept:pencil-case:v1',
      };
      const observation = {
        id: 'obs-1',
        sourceEntityId: 'offer-1',
        observationKey: '1688:offer:offer-1:2026-08-02',
        availableAt: new Date('2026-01-01T00:00:00Z'),
        ingestedAt: new Date('2026-01-01T00:00:00Z'),
      };
      supply.findOfferSnapshotsByExternalOffer.mockResolvedValue([offerSnapshot()]);
      supply.findOfferSnapshot.mockResolvedValue(offerSnapshot());
      // 파생이 지목한 행은 재조회에서도 나와야 한다. 그 사이에 사라지면 참조 오류가 맞다.
      launchCandidates.findBySupplierOfferSnapshotIds.mockResolvedValue([launch]);
      launchCandidates.findByIds.mockResolvedValue([launch]);
      evidenceRepository.findCandidateSupportingObservations.mockResolvedValue([observation]);
      evidenceRepository.findObservationsByIds.mockResolvedValue([observation]);
      sourceRegistry.authorize.mockResolvedValue({ allowed: true, entitlement: null });

      await service.create(createInput());

      expect(supply.findOfferSnapshotsByExternalOffer).toHaveBeenCalledWith(
        expect.objectContaining({ sourcePlatform: '1688', externalOfferIds: ['offer-1'] }),
      );
      // 파생 바인딩이 가리키는 참조도 함께 적재돼야 `toDecisionItem` 이 이를 찾을 수 있다.
      expect(launchCandidates.findByIds).toHaveBeenCalledWith(
        expect.objectContaining({ ids: ['launch-1'] }),
      );
      expect(evidenceRepository.findObservationsByIds).toHaveBeenCalledWith(
        expect.objectContaining({ observationIds: ['obs-1'] }),
      );
      const [command] = repository.create.mock.calls[0];
      expect(command.items[0]).toMatchObject({
        supplierOfferSkuSnapshotId: 'offer-snapshot-1',
        launchCandidateId: 'launch-1',
      });
    });

    it('클라이언트가 명시한 후보는 파생으로 덮어쓰지 않는다', async () => {
      supply.findOfferSnapshotsByExternalOffer.mockResolvedValue([offerSnapshot()]);
      supply.findOfferSnapshot.mockResolvedValue(offerSnapshot({ id: 'operator-choice' }));

      await service.create(
        createInput({
          candidateBindings: [
            { modelCandidateId: 'offer-1', supplierOfferSkuSnapshotId: 'operator-choice' },
          ],
        }),
      );

      // 명시 바인딩이 있는 후보는 파생 대상에서 빠지므로 조회 자체가 일어나지 않는다.
      expect(supply.findOfferSnapshotsByExternalOffer).not.toHaveBeenCalled();
      const [command] = repository.create.mock.calls[0];
      expect(command.items[0].supplierOfferSkuSnapshotId).toBe('operator-choice');
    });

    it('이어붙일 오퍼도 증거도 없으면 바인딩을 만들지 않는다', async () => {
      await service.create(createInput());

      expect(launchCandidates.findBySupplierOfferSnapshotIds).toHaveBeenCalledWith(
        expect.objectContaining({ supplierOfferSkuSnapshotIds: [] }),
      );
      const [command] = repository.create.mock.calls[0];
      expect(command.items[0]).toMatchObject({
        supplierOfferSkuSnapshotId: null,
        launchCandidateId: null,
      });
    });
  });

  it('persists every supplier match but keeps Phase 0 coverage confidence non-executable', async () => {
    const result = await service.create({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'decision-1',
      keyword: '필통',
    });

    expect(result.record.items).toHaveLength(1);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'shadow',
      modelPipeline: '1688_first_new_product_validation',
      items: [expect.objectContaining({
        modelCandidateId: 'offer-1',
        canonicalDecision: 'hold',
        executionEligible: false,
        confidenceKind: 'coverage',
        policyProbability: null,
        nextEvidenceAction: 'resolve_supplier_variant',
      })],
    }));
    expect(result.dataGaps).toContain('calibrated_purchase_probability_missing');
  });

  it('does not count evidence when the current source entitlement cannot score', async () => {
    const observation = {
      id: 'evidence-1',
      sourceKey: 'coupang-api',
      sourceScopeKey: 'default',
      platform: 'coupang',
      evidenceFamily: 'coupang_market',
      signalRole: 'demand',
      supportsCandidate: true,
      decisionImpactAtIngest: 'enabled',
      ingestionRunStatus: 'complete',
      observationKey: 'coupang-market:offer-1',
      conceptKey: 'concept:pencil-case:v1',
      sourceEntityId: 'coupang-1',
      availableAt: new Date('2026-01-01T00:00:00Z'),
      ingestedAt: new Date('2026-01-01T00:00:00Z'),
    };
    evidenceRepository.findObservationsByIds.mockResolvedValue([observation]);
    evidenceRepository.findLatestObservationRevisions.mockResolvedValue([{
      observationKey: observation.observationKey,
      observationId: observation.id,
      revision: 1,
    }]);
    sourceRegistry.authorize.mockResolvedValue({
      allowed: false,
      reasonCode: 'kill_switch_enabled',
      entitlement: null,
    });

    await service.create({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'decision-2',
      keyword: '필통',
      candidateBindings: [{
        modelCandidateId: 'offer-1',
        evidenceObservationIds: ['evidence-1'],
      }],
    });

    const command = repository.create.mock.calls[0][0];
    expect(command.items[0]).toMatchObject({
      evidenceFamilyCount: 0,
      evidencePlatformCount: 0,
      hasCoupangEvidence: false,
      evidence: [{ observationId: 'evidence-1', evidenceRole: 'context:demand' }],
    });
  });

  it('counts only terminal latest-revision evidence bound to the same launch concept and offer', async () => {
    const observations = [
      evidenceObservation({
        id: 'evidence-1688',
        sourceKey: '1688-api',
        platform: '1688',
        evidenceFamily: 'supplier_offer',
        signalRole: 'supply',
        sourceEntityId: 'offer-1',
        observationKey: 'offer-1:supply',
      }),
      evidenceObservation({
        id: 'evidence-coupang',
        sourceKey: 'coupang-api',
        platform: 'coupang',
        evidenceFamily: 'coupang_demand',
        signalRole: 'demand',
        sourceEntityId: 'coupang-1',
        observationKey: 'offer-1:coupang',
      }),
    ];
    launchCandidates.findByIds.mockResolvedValue([launchCandidate()]);
    supply.findOfferSnapshot.mockResolvedValue(
      offerSnapshot({ evidenceObservationId: 'evidence-1688' }),
    );
    evidenceRepository.findObservationsByIds.mockResolvedValue(observations);
    evidenceRepository.findLatestObservationRevisions.mockResolvedValue(
      observations.map((observation) => ({
        observationKey: observation.observationKey,
        observationId: observation.id,
        revision: 1,
      })),
    );
    sourceRegistry.authorize.mockResolvedValue({
      allowed: true,
      reasonCode: null,
      entitlement: { id: 'entitlement-1', minimumCoverageBps: 8_000 },
    });

    await service.create({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'decision-terminal-evidence',
      keyword: '필통',
      candidateBindings: [{
        modelCandidateId: 'offer-1',
        supplierOfferSkuSnapshotId: 'offer-snapshot-1',
        launchCandidateId: 'launch-1',
        evidenceObservationIds: observations.map(({ id }) => id),
      }],
    });

    const item = repository.create.mock.calls[0][0].items[0];
    expect(item).toMatchObject({
      evidenceFamilyCount: 2,
      evidencePlatformCount: 2,
      hasCoupangEvidence: true,
      has1688Evidence: true,
      evidence: [
        { observationId: 'evidence-1688', evidenceRole: 'support:supply' },
        { observationId: 'evidence-coupang', evidenceRole: 'support:demand' },
      ],
      modelOutput: {
        eligibleSupportingEvidenceCount: 2,
        latestRevisionEvidenceCount: 2,
        terminalEvidenceCount: 2,
        conceptMatchedEvidenceCount: 2,
        offerProvenanceBound: true,
      },
    });
  });

  it('keeps superseded and quarantined observations as context only', async () => {
    const observations = [
      evidenceObservation({
        id: 'evidence-old',
        sourceKey: '1688-api',
        platform: '1688',
        signalRole: 'supply',
        sourceEntityId: 'offer-1',
        observationKey: 'offer-1:revision',
      }),
      evidenceObservation({
        id: 'evidence-quarantined',
        sourceKey: 'coupang-api',
        platform: 'coupang',
        signalRole: 'demand',
        sourceEntityId: 'coupang-1',
        observationKey: 'offer-1:quarantine',
        ingestionRunStatus: 'quarantined',
      }),
    ];
    launchCandidates.findByIds.mockResolvedValue([launchCandidate()]);
    supply.findOfferSnapshot.mockResolvedValue(offerSnapshot());
    evidenceRepository.findObservationsByIds.mockResolvedValue(observations);
    evidenceRepository.findLatestObservationRevisions.mockResolvedValue([
      {
        observationKey: 'offer-1:revision',
        observationId: 'evidence-newer',
        revision: 2,
      },
      {
        observationKey: 'offer-1:quarantine',
        observationId: 'evidence-quarantined',
        revision: 1,
      },
    ]);
    sourceRegistry.authorize.mockResolvedValue({
      allowed: true,
      reasonCode: null,
      entitlement: { id: 'entitlement-1', minimumCoverageBps: 8_000 },
    });

    await service.create({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'decision-inadmissible-evidence',
      keyword: '필통',
      candidateBindings: [{
        modelCandidateId: 'offer-1',
        supplierOfferSkuSnapshotId: 'offer-snapshot-1',
        launchCandidateId: 'launch-1',
        evidenceObservationIds: observations.map(({ id }) => id),
      }],
    });

    const item = repository.create.mock.calls[0][0].items[0];
    expect(item.evidenceFamilyCount).toBe(0);
    expect(item.evidence).toEqual([
      { observationId: 'evidence-old', evidenceRole: 'context:supply' },
      { observationId: 'evidence-quarantined', evidenceRole: 'context:demand' },
    ]);
    expect(item.riskCodes).toContain('inadmissible_evidence_bound');
  });

  it('keeps evidence older than the source freshness contract as context only', async () => {
    const observation = evidenceObservation({
      id: 'evidence-stale',
      eventAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    launchCandidates.findByIds.mockResolvedValue([launchCandidate()]);
    supply.findOfferSnapshot.mockResolvedValue(offerSnapshot());
    evidenceRepository.findObservationsByIds.mockResolvedValue([observation]);
    evidenceRepository.findLatestObservationRevisions.mockResolvedValue([{
      observationKey: observation.observationKey,
      observationId: observation.id,
      revision: 1,
    }]);
    sourceRegistry.authorize.mockResolvedValue({
      allowed: true,
      reasonCode: null,
      entitlement: {
        id: 'entitlement-1',
        maxStalenessMinutes: 60,
        minimumCoverageBps: 8_000,
      },
    });

    await service.create({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'decision-stale-evidence',
      keyword: '필통',
      candidateBindings: [{
        modelCandidateId: 'offer-1',
        supplierOfferSkuSnapshotId: 'offer-snapshot-1',
        launchCandidateId: 'launch-1',
        evidenceObservationIds: [observation.id],
      }],
    });

    const item = repository.create.mock.calls[0][0].items[0];
    expect(item.evidenceFamilyCount).toBe(0);
    expect(item.evidence).toEqual([
      { observationId: observation.id, evidenceRole: 'context:supply' },
    ]);
  });

  it('does not revive evidence from an older entitlement version', async () => {
    const observation = evidenceObservation({
      id: 'evidence-old-entitlement',
      sourceEntitlementVersionId: 'entitlement-retired',
    });
    launchCandidates.findByIds.mockResolvedValue([launchCandidate()]);
    supply.findOfferSnapshot.mockResolvedValue(offerSnapshot());
    evidenceRepository.findObservationsByIds.mockResolvedValue([observation]);
    evidenceRepository.findLatestObservationRevisions.mockResolvedValue([{
      observationKey: observation.observationKey,
      observationId: observation.id,
      revision: 1,
    }]);
    sourceRegistry.authorize.mockResolvedValue({
      allowed: true,
      reasonCode: null,
      entitlement: {
        id: 'entitlement-current',
        minimumCoverageBps: 8_000,
      },
    });

    await service.create({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'decision-old-entitlement',
      keyword: '필통',
      candidateBindings: [{
        modelCandidateId: 'offer-1',
        supplierOfferSkuSnapshotId: 'offer-snapshot-1',
        launchCandidateId: 'launch-1',
        evidenceObservationIds: [observation.id],
      }],
    });

    expect(repository.create.mock.calls[0][0].items[0]).toMatchObject({
      evidenceFamilyCount: 0,
      evidence: [{
        observationId: observation.id,
        evidenceRole: 'context:supply',
      }],
    });
  });

  it.each([
    ['partial run', { ingestionRunStatus: 'partial', ingestionRunCoverageBps: 10_000 }],
    ['below coverage floor', { ingestionRunStatus: 'complete', ingestionRunCoverageBps: 7_999 }],
    ['unknown coverage', { ingestionRunStatus: 'complete', ingestionRunCoverageBps: null }],
  ] as const)('keeps %s evidence out of positive gates', async (_label, runState) => {
    const observation = evidenceObservation({
      id: 'evidence-low-coverage',
      ...runState,
    });
    launchCandidates.findByIds.mockResolvedValue([launchCandidate()]);
    supply.findOfferSnapshot.mockResolvedValue(offerSnapshot());
    evidenceRepository.findObservationsByIds.mockResolvedValue([observation]);
    evidenceRepository.findLatestObservationRevisions.mockResolvedValue([{
      observationKey: observation.observationKey,
      observationId: observation.id,
      revision: 1,
    }]);
    sourceRegistry.authorize.mockResolvedValue({
      allowed: true,
      reasonCode: null,
      entitlement: { id: 'entitlement-1', minimumCoverageBps: 8_000 },
    });

    await service.create({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      idempotencyKey: `decision-${_label}`,
      keyword: '필통',
      candidateBindings: [{
        modelCandidateId: 'offer-1',
        supplierOfferSkuSnapshotId: 'offer-snapshot-1',
        launchCandidateId: 'launch-1',
        evidenceObservationIds: [observation.id],
      }],
    });

    expect(repository.create.mock.calls[0][0].items[0]).toMatchObject({
      evidenceFamilyCount: 0,
      evidencePlatformCount: 0,
      evidence: [{
        observationId: observation.id,
        evidenceRole: 'context:supply',
      }],
    });
  });

  it.each(['risk', 'compliance', 'execution', 'outcome'] as const)(
    'does not let %s evidence fill a positive recommendation gate',
    async (signalRole) => {
      const observation = evidenceObservation({
        id: `evidence-${signalRole}`,
        signalRole,
        platform: 'coupang',
        evidenceFamily: `${signalRole}_family`,
      });
      launchCandidates.findByIds.mockResolvedValue([launchCandidate()]);
      supply.findOfferSnapshot.mockResolvedValue(offerSnapshot());
      evidenceRepository.findObservationsByIds.mockResolvedValue([observation]);
      evidenceRepository.findLatestObservationRevisions.mockResolvedValue([{
        observationKey: observation.observationKey,
        observationId: observation.id,
        revision: 1,
      }]);
      sourceRegistry.authorize.mockResolvedValue({
        allowed: true,
        reasonCode: null,
        entitlement: {
          id: 'entitlement-1',
          maxStalenessMinutes: 1_440,
          retentionDays: 365,
          minimumCoverageBps: 8_000,
        },
      });

      await service.create({
        organizationId: 'org-1',
        requestedByUserId: 'user-1',
        idempotencyKey: `decision-${signalRole}-evidence`,
        keyword: '필통',
        candidateBindings: [{
          modelCandidateId: 'offer-1',
          supplierOfferSkuSnapshotId: 'offer-snapshot-1',
          launchCandidateId: 'launch-1',
          evidenceObservationIds: [observation.id],
        }],
      });

      const item = repository.create.mock.calls[0][0].items[0];
      expect(item.evidenceFamilyCount).toBe(0);
      expect(item.evidencePlatformCount).toBe(0);
      expect(item.evidence).toEqual([{
        observationId: observation.id,
        evidenceRole: `context:${signalRole}`,
      }]);
    },
  );

  it('requires exact Coupang-demand and 1688-supply roles, not platform names alone', async () => {
    const observations = [
      evidenceObservation({
        id: 'evidence-1688-demand',
        platform: '1688',
        signalRole: 'demand',
        evidenceFamily: '1688_demand',
        observationKey: 'offer-1:1688-demand',
      }),
      evidenceObservation({
        id: 'evidence-coupang-supply',
        platform: 'coupang',
        signalRole: 'supply',
        evidenceFamily: 'coupang_supply',
        observationKey: 'offer-1:coupang-supply',
      }),
    ];
    launchCandidates.findByIds.mockResolvedValue([launchCandidate()]);
    supply.findOfferSnapshot.mockResolvedValue(offerSnapshot());
    evidenceRepository.findObservationsByIds.mockResolvedValue(observations);
    evidenceRepository.findLatestObservationRevisions.mockResolvedValue(
      observations.map((observation) => ({
        observationKey: observation.observationKey,
        observationId: observation.id,
        revision: 1,
      })),
    );
    sourceRegistry.authorize.mockResolvedValue({
      allowed: true,
      reasonCode: null,
      entitlement: {
        id: 'entitlement-1',
        maxStalenessMinutes: 1_440,
        retentionDays: 365,
        minimumCoverageBps: 8_000,
      },
    });

    await service.create({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'decision-swapped-roles',
      keyword: '필통',
      candidateBindings: [{
        modelCandidateId: 'offer-1',
        supplierOfferSkuSnapshotId: 'offer-snapshot-1',
        launchCandidateId: 'launch-1',
        evidenceObservationIds: observations.map(({ id }) => id),
      }],
    });

    const item = repository.create.mock.calls[0][0].items[0];
    expect(item.hasCoupangEvidence).toBe(false);
    expect(item.has1688Evidence).toBe(false);
    expect(item.reasonCodes).toContain('coupang_demand_evidence_missing');
    expect(item.reasonCodes).toContain('1688_supply_evidence_missing');
  });

  it('rejects a supplier snapshot bound to a different model offer', async () => {
    supply.findOfferSnapshot.mockResolvedValue(
      offerSnapshot({ externalOfferId: 'different-offer' }),
    );

    await expect(service.create({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'decision-mismatched-offer',
      keyword: '필통',
      candidateBindings: [{
        modelCandidateId: 'offer-1',
        supplierOfferSkuSnapshotId: 'offer-snapshot-1',
      }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects evidence ingested after the point-in-time cutoff even when availableAt is backdated', async () => {
    const observation = evidenceObservation({
      id: 'evidence-backdated',
      ingestedAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    evidenceRepository.findObservationsByIds.mockResolvedValue([observation]);

    await expect(service.create({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      idempotencyKey: 'decision-backdated-ingest',
      keyword: '필통',
      candidateBindings: [{
        modelCandidateId: 'offer-1',
        evidenceObservationIds: [observation.id],
      }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('blocks a test-order intent unless the immutable decision is execution eligible', async () => {
    repository.findItemById.mockResolvedValue({
      id: 'item-1',
      canonicalDecision: 'hold',
      executionEligible: false,
      supplierOfferSkuSnapshotId: 'offer-snapshot-1',
      launchCandidateId: 'launch-1',
      decisionBatchStatus: 'shadow',
      decisionBatchExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    await expect(service.createProcurementIntent({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      decisionItemId: 'item-1',
      idempotencyKey: 'intent-1',
      intentType: 'test_order',
      selectedPriceTierId: 'tier-1',
      requestedOrderUnits: 100,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(supply.createProcurementTestIntent).not.toHaveBeenCalled();
  });

  it('blocks RFQ and sample intents after the immutable decision batch expires', async () => {
    repository.findItemById.mockResolvedValue({
      id: 'item-expired',
      canonicalDecision: 'hold',
      executionEligible: false,
      supplierOfferSkuSnapshotId: 'offer-snapshot-1',
      launchCandidateId: 'launch-1',
      decisionBatchStatus: 'shadow',
      decisionBatchExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    await expect(service.createProcurementIntent({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      decisionItemId: 'item-expired',
      idempotencyKey: 'intent-expired',
      intentType: 'request_rfq',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(supply.createProcurementTestIntent).not.toHaveBeenCalled();
  });

  it('rechecks supporting evidence and current source entitlement before a test-order intent', async () => {
    const observation = evidenceObservation({
      id: 'evidence-revoked',
      observationKey: 'offer-1:revoked',
    });
    repository.findItemById.mockResolvedValue({
      id: 'item-active',
      canonicalDecision: 'test_order',
      executionEligible: true,
      supplierOfferSkuSnapshotId: 'offer-snapshot-1',
      launchCandidateId: 'launch-1',
      decisionBatchStatus: 'active',
      decisionBatchExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
      evidence: [{
        observationId: observation.id,
        evidenceRole: 'support:supply',
      }],
    });
    evidenceRepository.findObservationsByIds.mockResolvedValue([observation]);
    evidenceRepository.findLatestObservationRevisions.mockResolvedValue([{
      observationKey: observation.observationKey,
      observationId: observation.id,
      revision: 1,
    }]);
    sourceRegistry.authorize.mockResolvedValue({
      allowed: false,
      reasonCode: 'kill_switch_enabled',
      entitlement: null,
    });

    await expect(service.createProcurementIntent({
      organizationId: 'org-1',
      requestedByUserId: 'user-1',
      decisionItemId: 'item-active',
      idempotencyKey: 'intent-revoked',
      intentType: 'test_order',
      selectedPriceTierId: 'tier-1',
      requestedOrderUnits: 100,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(supply.createProcurementTestIntent).not.toHaveBeenCalled();
  });
});

function evidenceObservation(overrides: Record<string, unknown> = {}) {
  const at = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'evidence-1',
    sourceEntitlementVersionId: 'entitlement-1',
    sourceKey: '1688-api',
    sourceScopeKey: 'default',
    platform: '1688',
    evidenceFamily: 'supplier_offer',
    signalRole: 'supply',
    supportsCandidate: true,
    decisionImpactAtIngest: 'enabled',
    ingestionRunStatus: 'complete',
    ingestionRunCoverageBps: 10_000,
    ingestionRunCompletedAt: at,
    observationKey: 'offer-1:evidence',
    conceptKey: 'concept:pencil-case:v1',
    sourceEntityId: 'offer-1',
    eventAt: at,
    availableAt: at,
    ingestedAt: at,
    ...overrides,
  };
}

function launchCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'launch-1',
    supplierOfferSkuSnapshotId: 'offer-snapshot-1',
    productConceptVersionKey: 'concept:pencil-case:v1',
    unknownRiskCodes: [],
    blockingRiskCodes: [],
    economicsStatus: 'known',
    profitP10Krw: 2_000,
    complianceStatus: 'passed',
    ipStatus: 'passed',
    qualityStatus: 'passed',
    validUntil: new Date('2099-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    requestedByUserId: 'user-1',
    idempotencyKey: 'decision-1',
    keyword: '필통',
    ...overrides,
  } as Parameters<SourcingDecisionBatchService['create']>[0];
}

function offerSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offer-snapshot-1',
    evidenceObservationId: 'evidence-1688',
    externalOfferId: 'offer-1',
    externalSkuId: 'sku-1',
    sourcePlatform: '1688',
    identityStatus: 'exact_variant',
    validUntil: new Date('2099-01-01T00:00:00.000Z'),
    ...overrides,
  };
}
