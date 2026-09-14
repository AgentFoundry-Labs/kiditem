import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SOURCING_RECOMMENDATION_PROJECTION_GENERATOR_VERSION,
  SOURCING_RECOMMENDATION_PROJECTION_PIPELINE,
  SOURCING_RECOMMENDATION_PROJECTION_VERSION,
  type SourcingRecommendationProjectionSupplierCandidate,
} from '../../domain/sourcing-recommendation-projection';
import {
  decideSourcingRecommendation,
  type RecommendationGateStatus,
} from '../../domain/recommendation-decision-policy';
import { hashSourcingIntelligenceJson } from '../../domain/sourcing-intelligence-hash';
import {
  SOURCING_SUPPLY_INTELLIGENCE_PORT,
  type SourcingProcurementIntentType,
  type SourcingSupplierOfferSnapshot,
  type SourcingSupplyIntelligencePort,
} from '../port/out/cross-domain/sourcing-supply-intelligence.port';
import {
  SOURCING_DECISION_BATCH_REPOSITORY_PORT,
  type CreateSourcingDecisionBatchItemCommand,
  type SourcingDecisionBatchItemWithBatchRecord,
  type SourcingDecisionBatchRepositoryPort,
} from '../port/out/repository/sourcing-decision-batch.repository.port';
import {
  SOURCING_EVIDENCE_LEDGER_REPOSITORY_PORT,
  type SourcingEvidenceLedgerRepositoryPort,
  type SourcingEvidenceObservationRecord,
} from '../port/out/repository/sourcing-evidence-ledger.repository.port';
import {
  SOURCING_LAUNCH_CANDIDATE_REPOSITORY_PORT,
  type SourcingLaunchCandidateRecord,
  type SourcingLaunchCandidateRepositoryPort,
} from '../port/out/repository/sourcing-launch-candidate.repository.port';
import { SourcingMarketDiscoveryService } from './sourcing-market-discovery.service';

const RECOMMENDATION_POLICY_VERSION = 'sourcing-recommendation-gate.phase0.v1';
/** 모델 후보(1688 offerId)와 공급 오퍼·증거를 이어붙일 때 기준이 되는 플랫폼. */
const DISCOVERY_SUPPLY_PLATFORM = '1688';
const DEFAULT_EXPIRY_HOURS = 24;
const MAX_EXPIRY_HOURS = 168;
const MAX_EVIDENCE_AGE_MINUTES = 7 * 24 * 60;
const INVESTIGATION_BATCH_STATUSES = new Set(['shadow', 'active']);

export interface SourcingDecisionCandidateBindingInput {
  modelCandidateId: string;
  supplierOfferSkuSnapshotId?: string | null;
  launchCandidateId?: string | null;
  evidenceObservationIds?: string[];
}

export interface CreateSourcingDecisionBatchInput {
  organizationId: string;
  requestedByUserId: string;
  idempotencyKey: string;
  keyword: string;
  category?: string | null;
  expiresInHours?: number;
  candidateBindings?: SourcingDecisionCandidateBindingInput[];
}

@Injectable()
export class SourcingDecisionBatchService {
  constructor(
    private readonly discovery: SourcingMarketDiscoveryService,
    @Inject(SOURCING_DECISION_BATCH_REPOSITORY_PORT)
    private readonly repository: SourcingDecisionBatchRepositoryPort,
    @Inject(SOURCING_EVIDENCE_LEDGER_REPOSITORY_PORT)
    private readonly evidenceRepository: SourcingEvidenceLedgerRepositoryPort,
    @Inject(SOURCING_LAUNCH_CANDIDATE_REPOSITORY_PORT)
    private readonly launchCandidates: SourcingLaunchCandidateRepositoryPort,
    @Inject(SOURCING_SUPPLY_INTELLIGENCE_PORT)
    private readonly supply: SourcingSupplyIntelligencePort,
  ) {}

  async create(input: CreateSourcingDecisionBatchInput) {
    const request = normalizeCreateRequest(input);
    const sourceCutoffAt = new Date();
    const discovery = await this.discovery.discover({
      organizationId: input.organizationId,
      keyword: request.keyword,
      category: request.category,
      mode: 'replay',
    });
    // 클라이언트가 명시한 바인딩이 우선이고, 나머지 후보는 서버가 이어붙인다.
    // 파생은 "무엇을 후보로 볼지"만 정한다 — 채택 여부는 `evidenceIsAdmissible` 이 다시 판정한다.
    const derivedBindings = await this.deriveCandidateBindings({
      organizationId: input.organizationId,
      candidates: discovery.supplierMatches,
      explicitCandidateIds: new Set(
        request.candidateBindings.map(({ modelCandidateId }) => modelCandidateId),
      ),
      sourceCutoffAt,
    });
    const effectiveBindings = [...request.candidateBindings, ...derivedBindings];
    const bindingByCandidateId = indexBindings(
      effectiveBindings,
      discovery.supplierMatches,
    );
    // 파생 바인딩이 가리키는 오퍼·출시후보·관측치도 함께 적재해야 한다.
    // 클라이언트 바인딩만 넘기면 파생분 참조가 비어 `toDecisionItem` 에서 터진다.
    const references = await this.loadReferences({
      organizationId: input.organizationId,
      sourceCutoffAt,
      bindings: effectiveBindings,
    });
    const batchDataGaps = Array.from(new Set(discovery.dataGaps));

    const items = discovery.supplierMatches.map((candidate) =>
      this.toDecisionItem({
        candidate,
        confidence: discovery.confidence,
        binding: bindingByCandidateId.get(candidate.id) ?? null,
        references,
        sourceCutoffAt,
        dataGaps: batchDataGaps,
      }),
    );
    const decisionAt = new Date();
    const expiresAt = new Date(
      decisionAt.getTime() + request.expiresInHours * 60 * 60 * 1000,
    );
    const result = await this.repository.create({
      organizationId: input.organizationId,
      batchKey: request.idempotencyKey,
      requestHash: hashSourcingIntelligenceJson({
        organizationId: input.organizationId,
        requestedByUserId: input.requestedByUserId,
        idempotencyKey: request.idempotencyKey,
        keyword: request.keyword,
        category: request.category,
        expiresInHours: request.expiresInHours,
        candidateBindings: request.candidateBindings,
      }),
      status: 'shadow',
      keyword: request.keyword,
      category: request.category,
      policyVersion: RECOMMENDATION_POLICY_VERSION,
      modelPipeline: SOURCING_RECOMMENDATION_PROJECTION_PIPELINE,
      modelVersion: String(SOURCING_RECOMMENDATION_PROJECTION_VERSION),
      modelGeneratorVersion: SOURCING_RECOMMENDATION_PROJECTION_GENERATOR_VERSION,
      decisionAt,
      sourceCutoffAt,
      expiresAt,
      createdByUserId: input.requestedByUserId,
      items,
    });
    if (result.kind === 'idempotency_conflict') {
      throw new ConflictException(
        'Decision batch idempotency key was reused with different input',
      );
    }
    if (result.kind === 'source_evidence_changed') {
      throw new ConflictException(
        'Supporting evidence changed before the decision batch was committed',
      );
    }
    if (result.kind === 'reference_not_found') {
      throw new BadRequestException(
        'A decision batch reference no longer exists in this organization',
      );
    }
    return {
      ...result,
      dataGaps: batchDataGaps,
    };
  }

  async get(organizationId: string, id: string) {
    const record = await this.repository.findById({ organizationId, id });
    if (!record) throw new NotFoundException('Sourcing decision batch not found');
    return record;
  }

  async latest(organizationId: string) {
    return this.repository.findLatest({ organizationId });
  }

  async createProcurementIntent(input: {
    organizationId: string;
    requestedByUserId: string;
    decisionItemId: string;
    idempotencyKey: string;
    intentType: SourcingProcurementIntentType;
    selectedPriceTierId?: string | null;
    requestedOrderUnits?: number | null;
  }) {
    const item = await this.repository.findItemById({
      organizationId: input.organizationId,
      id: input.decisionItemId,
    });
    if (!item) throw new NotFoundException('Sourcing decision item not found');
    const intentAt = new Date();
    if (
      !INVESTIGATION_BATCH_STATUSES.has(item.decisionBatchStatus) ||
      item.decisionBatchExpiresAt.getTime() <= intentAt.getTime()
    ) {
      throw new BadRequestException(
        'The sourcing decision batch is stale, expired, or inactive',
      );
    }
    if (item.canonicalDecision === 'reject') {
      throw new BadRequestException('Rejected recommendations cannot create procurement intents');
    }
    if (!item.supplierOfferSkuSnapshotId) {
      throw new BadRequestException('A supplier offer snapshot is required');
    }
    if (
      input.intentType === 'test_order' &&
      (item.canonicalDecision !== 'test_order' ||
        !item.executionEligible ||
        !item.launchCandidateId ||
        item.decisionBatchStatus !== 'active')
    ) {
      throw new BadRequestException(
        'Test-order intent requires an execution-eligible test_order decision',
      );
    }
    if (input.intentType === 'test_order') {
      await this.assertExecutionEvidenceStillEligible({
        organizationId: input.organizationId,
        item,
        at: intentAt,
      });
    }

    return this.supply.createProcurementTestIntent({
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: requiredText(input.idempotencyKey, 'idempotencyKey'),
      intentType: input.intentType,
      sourceDecisionItemId: item.id,
      supplierOfferSkuSnapshotId: item.supplierOfferSkuSnapshotId,
      launchCandidateId: item.launchCandidateId,
      selectedPriceTierId: optionalText(input.selectedPriceTierId),
      requestedOrderUnits: nullablePositiveInteger(
        input.requestedOrderUnits,
        'requestedOrderUnits',
      ),
    });
  }

  private async assertExecutionEvidenceStillEligible(input: {
    organizationId: string;
    item: SourcingDecisionBatchItemWithBatchRecord;
    at: Date;
  }): Promise<void> {
    const item = input.item;
    const supportIds = item.evidence
      .filter(({ evidenceRole }) => evidenceRole.startsWith('support:'))
      .map(({ observationId }) => observationId);
    const observations = await this.evidenceRepository.findObservationsByIds({
      organizationId: input.organizationId,
      observationIds: supportIds,
    });
    if (observations.length !== supportIds.length || observations.length === 0) {
      throw new BadRequestException(
        'Execution evidence is missing or no longer addressable',
      );
    }
    const latest = await this.evidenceRepository.findLatestObservationRevisions({
      organizationId: input.organizationId,
      observationKeys: observations.map(({ observationKey }) => observationKey),
      cutoffAt: input.at,
    });
    const latestByKey = new Map(
      latest.map((record) => [record.observationKey, record.observationId]),
    );
    const revoked = observations.some((observation) =>
      !evidenceRunSupportsDecision(observation, input.at) ||
      observation.availableAt.getTime() > input.at.getTime() ||
      observation.ingestedAt.getTime() > input.at.getTime() ||
      latestByKey.get(observation.observationKey) !== observation.id ||
      !evidenceIsFresh(
        observation,
        MAX_EVIDENCE_AGE_MINUTES,
        input.at,
      ),
    );
    if (revoked) {
      throw new BadRequestException(
        'Execution evidence was superseded, quarantined, expired, or revoked',
      );
    }
  }

  private async loadReferences(input: {
    organizationId: string;
    sourceCutoffAt: Date;
    bindings: NormalizedCandidateBinding[];
  }): Promise<DecisionReferences> {
    return this.loadCandidateReferences(input);
  }

  /**
   * 모델 후보(1688 offerId)를 공급 오퍼 스냅샷·출시 후보·증거 관측치와 이어붙인다.
   *
   * 이어붙이는 기준은 외부 오퍼 식별자 하나뿐이다. 여기서 만든 바인딩은 "이 후보에
   * 딸린 것으로 보이는 것들"일 뿐이고, 실제 증거 채택은 최신 리비전·
   * run 확정·개념키 일치·오퍼 대조를 모두 보는 `evidenceIsAdmissible` 이 결정한다.
   */
  private async deriveCandidateBindings(input: {
    organizationId: string;
    candidates: SourcingRecommendationProjectionSupplierCandidate[];
    explicitCandidateIds: Set<string>;
    sourceCutoffAt: Date;
  }): Promise<NormalizedCandidateBinding[]> {
    const pending = input.candidates.filter(
      (candidate): candidate is SourcingRecommendationProjectionSupplierCandidate & { offerId: string } =>
        !input.explicitCandidateIds.has(candidate.id) && Boolean(candidate.offerId),
    );
    if (pending.length === 0) return [];

    const offerIds = uniqueStrings(pending.map((candidate) => candidate.offerId));
    const [offers, observations] = await Promise.all([
      this.supply.findOfferSnapshotsByExternalOffer({
        organizationId: input.organizationId,
        sourcePlatform: DISCOVERY_SUPPLY_PLATFORM,
        externalOfferIds: offerIds,
      }),
      this.evidenceRepository.findCandidateSupportingObservations({
        organizationId: input.organizationId,
        platform: DISCOVERY_SUPPLY_PLATFORM,
        sourceEntityIds: offerIds,
        cutoffAt: input.sourceCutoffAt,
      }),
    ]);

    // 같은 외부 오퍼에 스냅샷이 여럿이면 최신 캡처 하나만 쓴다(조회가 최신순 정렬).
    const offerByExternalId = new Map<string, SourcingSupplierOfferSnapshot>();
    for (const offer of offers) {
      if (!offerByExternalId.has(offer.externalOfferId)) {
        offerByExternalId.set(offer.externalOfferId, offer);
      }
    }
    const launches = await this.launchCandidates.findBySupplierOfferSnapshotIds({
      organizationId: input.organizationId,
      supplierOfferSkuSnapshotIds: [...offerByExternalId.values()].map(({ id }) => id),
    });
    const launchByOfferId = new Map<string, SourcingLaunchCandidateRecord>();
    for (const launch of launches) {
      if (!launchByOfferId.has(launch.supplierOfferSkuSnapshotId)) {
        launchByOfferId.set(launch.supplierOfferSkuSnapshotId, launch);
      }
    }
    const observationsByEntityId = new Map<string, string[]>();
    for (const observation of observations) {
      const bucket = observationsByEntityId.get(observation.sourceEntityId) ?? [];
      bucket.push(observation.id);
      observationsByEntityId.set(observation.sourceEntityId, bucket);
    }

    return pending
      .map((candidate) => {
        const offer = offerByExternalId.get(candidate.offerId) ?? null;
        const launch = offer ? launchByOfferId.get(offer.id) ?? null : null;
        const evidenceObservationIds = observationsByEntityId.get(candidate.offerId) ?? [];
        if (!offer && evidenceObservationIds.length === 0) return null;
        return {
          modelCandidateId: candidate.id,
          supplierOfferSkuSnapshotId: offer?.id ?? null,
          launchCandidateId: launch?.id ?? null,
          evidenceObservationIds,
        } satisfies NormalizedCandidateBinding;
      })
      .filter((binding): binding is NormalizedCandidateBinding => binding !== null)
      .sort((left, right) => left.modelCandidateId.localeCompare(right.modelCandidateId));
  }

  private async loadCandidateReferences(input: {
    organizationId: string;
    sourceCutoffAt: Date;
    bindings: NormalizedCandidateBinding[];
  }): Promise<DecisionReferences> {
    const launchIds = uniqueStrings(
      input.bindings.map((binding) => binding.launchCandidateId),
    );
    const observationIds = uniqueStrings(
      input.bindings.flatMap((binding) => binding.evidenceObservationIds),
    );
    const launchRows = launchIds.length
      ? await this.launchCandidates.findByIds({
          organizationId: input.organizationId,
          ids: launchIds,
        })
      : [];
    assertAllReferencesFound('launchCandidate', launchIds, launchRows.map(({ id }) => id));
    const observations = observationIds.length
      ? await this.evidenceRepository.findObservationsByIds({
          organizationId: input.organizationId,
          observationIds,
        })
      : [];
    assertAllReferencesFound(
      'evidenceObservation',
      observationIds,
      observations.map(({ id }) => id),
    );
    for (const observation of observations) {
      if (
        observation.availableAt.getTime() > input.sourceCutoffAt.getTime() ||
        observation.ingestedAt.getTime() > input.sourceCutoffAt.getTime()
      ) {
        throw new BadRequestException(
          `Evidence observation ${observation.id} was not available at the decision cutoff`,
        );
      }
    }
    const latestRevisions = observations.length
      ? await this.evidenceRepository.findLatestObservationRevisions({
          organizationId: input.organizationId,
          observationKeys: uniqueStrings(
            observations.map(({ observationKey }) => observationKey),
          ),
          cutoffAt: input.sourceCutoffAt,
        })
      : [];

    const offerIds = uniqueStrings([
      ...input.bindings.map((binding) => binding.supplierOfferSkuSnapshotId),
      ...launchRows.map((launch) => launch.supplierOfferSkuSnapshotId),
    ]);
    const offerRows = await Promise.all(
      offerIds.map((id) =>
        this.supply.findOfferSnapshot({ organizationId: input.organizationId, id }),
      ),
    );
    const offers = offerRows.filter(
      (offer): offer is SourcingSupplierOfferSnapshot => offer !== null,
    );
    assertAllReferencesFound('supplierOfferSkuSnapshot', offerIds, offers.map(({ id }) => id));

    return {
      launches: new Map(launchRows.map((row) => [row.id, row])),
      offers: new Map(offers.map((row) => [row.id, row])),
      observations: new Map(observations.map((row) => [row.id, row])),
      latestObservationIds: new Map(
        latestRevisions.map((row) => [row.observationKey, row.observationId]),
      ),
    };
  }

  private toDecisionItem(input: {
    candidate: SourcingRecommendationProjectionSupplierCandidate;
    confidence: number;
    binding: NormalizedCandidateBinding | null;
    references: DecisionReferences;
    sourceCutoffAt: Date;
    dataGaps: string[];
  }): CreateSourcingDecisionBatchItemCommand {
    const binding = input.binding;
    const launch = binding?.launchCandidateId
      ? input.references.launches.get(binding.launchCandidateId) ?? null
      : null;
    const offerId = binding?.supplierOfferSkuSnapshotId
      ?? launch?.supplierOfferSkuSnapshotId
      ?? null;
    if (
      launch &&
      binding?.supplierOfferSkuSnapshotId &&
      launch.supplierOfferSkuSnapshotId !== binding.supplierOfferSkuSnapshotId
    ) {
      throw new BadRequestException(
        `LaunchCandidate ${launch.id} does not use the bound supplier offer`,
      );
    }
    const offer = offerId ? input.references.offers.get(offerId) ?? null : null;
    if (offer && offer.externalOfferId !== input.candidate.offerId) {
      throw new BadRequestException(
        `Supplier offer ${offer.id} does not match model candidate ${input.candidate.id}`,
      );
    }
    const evidence = (binding?.evidenceObservationIds ?? []).map(
      (id) => input.references.observations.get(id)!,
    );
    const evidenceAdmissibility = new Map(
      evidence.map((observation) => [
        observation.id,
        evidenceIsAdmissible({
          observation,
          candidate: input.candidate,
          launch,
          offer,
          latestObservationId: input.references.latestObservationIds.get(
            observation.observationKey,
          ),
          cutoffAt: input.sourceCutoffAt,
        }),
      ]),
    );
    const supportingEvidence = evidence.filter(
      (observation) => evidenceAdmissibility.get(observation.id) === true,
    );
    const supportingFamilies = uniqueStrings(
      supportingEvidence.map(({ evidenceFamily }) => evidenceFamily),
    );
    const supportingPlatforms = uniqueStrings(
      supportingEvidence.map(({ platform }) => platform.toLowerCase()),
    );
    const hasCoupangDemandEvidence = supportingEvidence.some(
      (observation) =>
        observation.platform.toLowerCase() === 'coupang' &&
        observation.signalRole === 'demand',
    );
    const has1688SupplyEvidence = supportingEvidence.some(
      (observation) =>
        observation.platform.toLowerCase() === '1688' &&
        observation.signalRole === 'supply',
    );
    const offerProvenanceBound = !offer || evidence.some(
      (observation) =>
        observation.id === offer.evidenceObservationId &&
        evidenceAdmissibility.get(observation.id) === true,
    );
    const hasConceptMismatch = evidence.some(
      (observation) =>
        !launch ||
        normalizeConceptKey(launch.productConceptVersionKey) !==
          observation.conceptKey,
    );
    const hasInadmissibleEvidence = evidence.some(
      (observation) => evidenceAdmissibility.get(observation.id) !== true,
    );
    const unknownRiskCodes = uniqueStrings([
      ...(launch?.unknownRiskCodes ?? []),
      ...(!offerProvenanceBound
        ? ['supplier_offer_provenance_not_bound']
        : []),
      ...(hasConceptMismatch ? ['evidence_concept_not_bound'] : []),
      ...(hasInadmissibleEvidence ? ['inadmissible_evidence_bound'] : []),
    ]);
    const blockingRiskCodes = [
      ...(launch?.blockingRiskCodes ?? []),
      ...(launch?.economicsStatus === 'blocked' ? ['economics_blocked'] : []),
      ...(isExpired(launch?.validUntil, input.sourceCutoffAt)
        ? ['launch_candidate_expired']
        : []),
      ...(isExpired(offer?.validUntil, input.sourceCutoffAt)
        ? ['supplier_offer_expired']
        : []),
    ];
    const policy = decideSourcingRecommendation({
      baselineDecision: input.candidate.decision,
      confidenceKind: 'coverage',
      confidence: input.confidence,
      supportingEvidenceFamilies: supportingFamilies,
      supportingPlatforms,
      hasCoupangDemandEvidence,
      has1688SupplyEvidence,
      economics:
        launch?.economicsStatus === 'known' && launch.profitP10Krw !== null
          ? { status: 'known', profitP10: launch.profitP10Krw }
          : { status: 'unknown', profitP10: null },
      gates: {
        compliance: gateStatus(launch?.complianceStatus),
        ip: gateStatus(launch?.ipStatus),
        qc: gateStatus(launch?.qualityStatus),
      },
      blockingRiskCodes,
      unknownRiskCodes,
    });
    const needsExactVariant = !offer || offer.identityStatus !== 'exact_variant';
    const nextEvidenceAction =
      policy.decision !== 'reject' && needsExactVariant
        ? 'resolve_supplier_variant'
        : policy.nextEvidenceAction;
    const reasonCodes = needsExactVariant && policy.decision !== 'reject'
      ? uniqueStrings([...policy.reasonCodes, 'exact_supplier_variant_missing'])
      : policy.reasonCodes;

    return {
      modelCandidateId: input.candidate.id,
      rank: input.candidate.rank,
      productName: input.candidate.title,
      supplierOfferSkuSnapshotId: offerId,
      launchCandidateId: launch?.id ?? null,
      baselineDecision: input.candidate.decision,
      canonicalDecision: policy.decision,
      executionEligible: policy.executionEligible,
      baselineScore: input.candidate.score,
      confidence: input.confidence,
      confidenceKind: 'coverage',
      evidenceFamilyCount: supportingFamilies.length,
      evidencePlatformCount: supportingPlatforms.length,
      hasCoupangEvidence: hasCoupangDemandEvidence,
      has1688Evidence: has1688SupplyEvidence,
      nextEvidenceAction,
      reasonCodes,
      riskCodes: uniqueStrings([
        ...input.candidate.risks,
        ...blockingRiskCodes,
        ...unknownRiskCodes,
      ]),
      modelOutput: {
        candidate: input.candidate,
        discoveryConfidenceKind: 'coverage',
        discoveryDataGaps: input.dataGaps,
        sourceCutoffAt: input.sourceCutoffAt.toISOString(),
        boundEvidenceCount: evidence.length,
        eligibleSupportingEvidenceCount: supportingEvidence.length,
        latestRevisionEvidenceCount: evidence.filter(
          (observation) =>
            input.references.latestObservationIds.get(
              observation.observationKey,
            ) === observation.id,
        ).length,
        terminalEvidenceCount: evidence.filter((observation) =>
          evidenceRunIsTerminal(observation.ingestionRunStatus),
        ).length,
        conceptMatchedEvidenceCount: evidence.filter(
          (observation) =>
            launch &&
            normalizeConceptKey(launch.productConceptVersionKey) ===
              observation.conceptKey,
        ).length,
        offerProvenanceBound,
      },
      evidence: evidence.map((observation) => ({
        observationId: observation.id,
        evidenceRole: evidenceRole(
          observation,
          evidenceAdmissibility.get(observation.id) === true,
        ),
        sourceObservation: {
          sourceKey: observation.sourceKey,
          scopeKey: observation.sourceScopeKey,
          observationKey: observation.observationKey,
        },
      })),
    };
  }
}

interface NormalizedCandidateBinding {
  modelCandidateId: string;
  supplierOfferSkuSnapshotId: string | null;
  launchCandidateId: string | null;
  evidenceObservationIds: string[];
}

interface DecisionReferences {
  launches: Map<string, SourcingLaunchCandidateRecord>;
  offers: Map<string, SourcingSupplierOfferSnapshot>;
  observations: Map<string, SourcingEvidenceObservationRecord>;
  latestObservationIds: Map<string, string>;
}

function normalizeCreateRequest(input: CreateSourcingDecisionBatchInput) {
  const expiresInHours = input.expiresInHours ?? DEFAULT_EXPIRY_HOURS;
  if (
    !Number.isInteger(expiresInHours) ||
    expiresInHours <= 0 ||
    expiresInHours > MAX_EXPIRY_HOURS
  ) {
    throw new BadRequestException(
      `expiresInHours must be between 1 and ${MAX_EXPIRY_HOURS}`,
    );
  }
  return {
    idempotencyKey: limitedText(input.idempotencyKey, 'idempotencyKey', 300),
    keyword: limitedText(input.keyword, 'keyword', 160),
    category: optionalLimitedText(input.category, 'category', 160),
    expiresInHours,
    candidateBindings: (input.candidateBindings ?? [])
      .map(normalizeBinding)
      .sort((left, right) => left.modelCandidateId.localeCompare(right.modelCandidateId)),
  };
}

function normalizeBinding(
  input: SourcingDecisionCandidateBindingInput,
): NormalizedCandidateBinding {
  return {
    modelCandidateId: requiredText(input.modelCandidateId, 'modelCandidateId'),
    supplierOfferSkuSnapshotId: optionalText(input.supplierOfferSkuSnapshotId),
    launchCandidateId: optionalText(input.launchCandidateId),
    evidenceObservationIds: uniqueStrings(input.evidenceObservationIds ?? []).sort(),
  };
}

function indexBindings(
  bindings: NormalizedCandidateBinding[],
  candidates: SourcingRecommendationProjectionSupplierCandidate[],
): Map<string, NormalizedCandidateBinding> {
  const candidateIds = new Set(candidates.map(({ id }) => id));
  const indexed = new Map<string, NormalizedCandidateBinding>();
  for (const binding of bindings) {
    if (indexed.has(binding.modelCandidateId)) {
      throw new BadRequestException(
        `Duplicate candidate binding: ${binding.modelCandidateId}`,
      );
    }
    if (!candidateIds.has(binding.modelCandidateId)) {
      throw new BadRequestException(
        `Unknown model candidate binding: ${binding.modelCandidateId}`,
      );
    }
    indexed.set(binding.modelCandidateId, binding);
  }
  return indexed;
}

function evidenceRole(
  observation: SourcingEvidenceObservationRecord,
  admissibleSupport: boolean,
): string {
  if (admissibleSupport) {
    return `support:${observation.signalRole}`;
  }
  return `context:${observation.signalRole}`;
}

function evidenceIsAdmissible(input: {
  observation: SourcingEvidenceObservationRecord;
  candidate: SourcingRecommendationProjectionSupplierCandidate;
  launch: SourcingLaunchCandidateRecord | null;
  offer: SourcingSupplierOfferSnapshot | null;
  latestObservationId: string | undefined;
  cutoffAt: Date;
}): boolean {
  const { observation, candidate, launch, offer } = input;
  if (
    !positiveEvidenceRole(observation.signalRole) ||
    !observation.supportsCandidate ||
    !evidenceRunSupportsDecision(observation, input.cutoffAt) ||
    input.latestObservationId !== observation.id ||
    !launch ||
    normalizeConceptKey(launch.productConceptVersionKey) !== observation.conceptKey ||
    !evidenceIsFresh(
      observation,
      MAX_EVIDENCE_AGE_MINUTES,
      input.cutoffAt,
    )
  ) {
    return false;
  }
  if (observation.signalRole !== 'supply') return true;
  if (
    !offer ||
    observation.platform.toLowerCase() !== offer.sourcePlatform.toLowerCase()
  ) {
    return false;
  }
  const supplierEntityIds = new Set([
    candidate.offerId,
    offer.externalOfferId,
    offer.externalSkuId,
  ].filter((value): value is string => Boolean(value)));
  return supplierEntityIds.has(observation.sourceEntityId);
}

function positiveEvidenceRole(
  role: SourcingEvidenceObservationRecord['signalRole'],
): boolean {
  return role === 'demand' || role === 'supply';
}

function evidenceIsFresh(
  observation: Pick<SourcingEvidenceObservationRecord, 'eventAt'>,
  maxStalenessMinutes: number | null,
  at: Date,
): boolean {
  if (maxStalenessMinutes === null) return true;
  return at.getTime() - observation.eventAt.getTime() <=
    maxStalenessMinutes * 60_000;
}

function evidenceRunIsTerminal(
  status: SourcingEvidenceObservationRecord['ingestionRunStatus'],
) {
  return status === 'COMPLETE';
}

function evidenceRunSupportsDecision(
  observation: Pick<
    SourcingEvidenceObservationRecord,
    'ingestionRunStatus' | 'ingestionRunCoverageBps' | 'ingestionRunCompletedAt'
  >,
  at: Date,
): boolean {
  return observation.ingestionRunStatus === 'COMPLETE' &&
    observation.ingestionRunCompletedAt !== null &&
    observation.ingestionRunCompletedAt.getTime() <= at.getTime();
}

function normalizeConceptKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._:-]+/gu, '_');
}

function gateStatus(
  status: SourcingLaunchCandidateRecord['complianceStatus'] | undefined,
): RecommendationGateStatus {
  return status ?? 'not_evaluated';
}

function isExpired(value: Date | null | undefined, at: Date): boolean {
  return value !== null && value !== undefined && value.getTime() <= at.getTime();
}

function assertAllReferencesFound(
  label: string,
  expectedIds: string[],
  foundIds: string[],
): void {
  const found = new Set(foundIds);
  const missing = expectedIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new BadRequestException(`${label} not found: ${missing.join(', ')}`);
  }
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new BadRequestException(`${field} is required`);
  return normalized;
}

function limitedText(value: string, field: string, max: number): string {
  const normalized = requiredText(value, field);
  if (normalized.length > max) {
    throw new BadRequestException(`${field} must be at most ${max} characters`);
  }
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function optionalLimitedText(
  value: string | null | undefined,
  field: string,
  max: number,
): string | null {
  const normalized = optionalText(value);
  if (normalized && normalized.length > max) {
    throw new BadRequestException(`${field} must be at most ${max} characters`);
  }
  return normalized;
}

function nullablePositiveInteger(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
  return value;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  );
}
