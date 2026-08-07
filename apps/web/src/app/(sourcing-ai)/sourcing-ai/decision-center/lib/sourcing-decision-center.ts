import type {
  ProcurementTestIntent,
  SourcingDecisionBatch,
  SourcingDecisionBatchItem,
  SourcingLaunchCandidate,
  SourcingSourceEntitlement,
  SupplierOfferSnapshot,
} from './sourcing-intelligence-api';

export type SourceEntitlementEligibility =
  | 'decision_eligible'
  | 'shadow_only'
  | 'pending'
  | 'blocked';

export type DecisionBatchState =
  | 'missing'
  | 'investigation'
  | 'expired'
  | 'inactive';

export interface SourcingSourceEntitlementViewModel {
  id: string;
  sourceKey: string;
  scopeKey: string;
  ownerLabel: string;
  lifecycle: SourcingSourceEntitlement['lifecycle'];
  decisionImpact: SourcingSourceEntitlement['decisionImpact'];
  entitlementEligibility: SourceEntitlementEligibility;
  entitlementBlockReason: string | null;
  minimumCoverageBps: number | null;
  permissionExpiresAt: string | null;
}

export interface SourcingDecisionCandidateViewModel {
  id: string;
  rank: number;
  productName: string;
  decision: SourcingDecisionBatchItem['canonicalDecision'];
  decisionLabel: string;
  executionEligible: boolean;
  score: number;
  confidence: number;
  confidenceKind: SourcingDecisionBatchItem['confidenceKind'];
  evidenceFamilyCount: number;
  evidencePlatformCount: number;
  hasCoupangEvidence: boolean;
  has1688Evidence: boolean;
  nextEvidenceAction: SourcingDecisionBatchItem['nextEvidenceAction'];
  reasonCodes: string[];
  riskCodes: string[];
  offer: SupplierOfferSnapshot | null;
  launchCandidate: SourcingLaunchCandidate | null;
  latestIntent: ProcurementTestIntent | null;
  canRequestRfq: boolean;
  canRequestSample: boolean;
  actionBlockReasons: string[];
}

export interface SourcingDecisionCenterViewModel {
  latestBatch: SourcingDecisionBatch | null;
  batchState: DecisionBatchState;
  /**
   * 배치 단위 소스 커버리지(0..1). 서버는 키워드로 조회한 소스 그룹 중 비어있지 않은
   * 비율을 한 번 계산해 배치의 모든 후보에 그대로 복사한다. 따라서 후보 지표가 아니며,
   * 후보의 `evidenceFamilyCount`/`evidencePlatformCount` 와는 재는 대상이 다르다.
   *
   * 값이 균일할 때만 배치 지표로 인정한다. 서버가 후보별로 다른 값을 주기 시작하면
   * null 이 되어, 배치 지표로 잘못 표시하는 일을 막는다.
   */
  batchSourceCoverage: number | null;
  sourceEntitlements: SourcingSourceEntitlementViewModel[];
  candidates: SourcingDecisionCandidateViewModel[];
  summary: {
    sourceEntitlementCount: number;
    decisionEligibleEntitlementCount: number;
    blockedEntitlementCount: number;
    launchCandidateCount: number;
    decisionCandidateCount: number;
    holdCount: number;
    rejectCount: number;
    testOrderCount: number;
    proposedIntentCount: number;
  };
}

export interface BuildSourcingDecisionCenterViewModelInput {
  sources: SourcingSourceEntitlement[];
  launchCandidates: SourcingLaunchCandidate[];
  latestBatch: SourcingDecisionBatch | null;
  supplierOffers: SupplierOfferSnapshot[];
  procurementIntents: ProcurementTestIntent[];
  procurementIntentTotal?: number;
  now?: Date | string | number;
}

/**
 * Builds one route-local read model without treating an entitlement as proof
 * that a collector ran successfully. Per-run coverage is intentionally absent
 * from this API surface and must not be inferred here.
 */
export function buildSourcingDecisionCenterViewModel(
  input: BuildSourcingDecisionCenterViewModelInput,
): SourcingDecisionCenterViewModel {
  const now = requiredTimestamp(input.now ?? Date.now(), 'now');
  const sourceEntitlements = input.sources.map((source) =>
    toSourceEntitlementViewModel(source, now),
  );
  const batchState = resolveDecisionBatchState(input.latestBatch, now);
  const offersById = new Map(
    input.supplierOffers.map((offer) => [offer.id, offer]),
  );
  const launchesById = new Map(
    input.launchCandidates.map((candidate) => [candidate.id, candidate]),
  );
  const intentsByDecisionItem = indexLatestIntents(
    input.procurementIntents,
  );
  const candidates = (input.latestBatch?.items ?? [])
    .map((item) =>
      toCandidateViewModel({
        item,
        batchState,
        offer: item.supplierOfferSkuSnapshotId
          ? offersById.get(item.supplierOfferSkuSnapshotId) ?? null
          : null,
        launchCandidate: item.launchCandidateId
          ? launchesById.get(item.launchCandidateId) ?? null
          : null,
        latestIntent: intentsByDecisionItem.get(item.id) ?? null,
      }),
    )
    .sort((left, right) => left.rank - right.rank);

  return {
    latestBatch: input.latestBatch,
    batchState,
    batchSourceCoverage: resolveBatchSourceCoverage(candidates),
    sourceEntitlements,
    candidates,
    summary: {
      sourceEntitlementCount: sourceEntitlements.length,
      decisionEligibleEntitlementCount: sourceEntitlements.filter(
        ({ entitlementEligibility }) =>
          entitlementEligibility === 'decision_eligible',
      ).length,
      blockedEntitlementCount: sourceEntitlements.filter(
        ({ entitlementEligibility }) => entitlementEligibility === 'blocked',
      ).length,
      launchCandidateCount: input.launchCandidates.length,
      decisionCandidateCount: candidates.length,
      holdCount: candidates.filter(({ decision }) => decision === 'hold').length,
      rejectCount: candidates.filter(({ decision }) => decision === 'reject')
        .length,
      testOrderCount: candidates.filter(
        ({ decision }) => decision === 'test_order',
      ).length,
      proposedIntentCount:
        input.procurementIntentTotal
        ?? input.procurementIntents.filter(({ status }) => status === 'proposed').length,
    },
  };
}

export function resolveSourceEntitlementEligibility(
  source: SourcingSourceEntitlement,
  nowInput: Date | string | number = Date.now(),
): {
  eligibility: SourceEntitlementEligibility;
  blockReason: string | null;
} {
  const now = requiredTimestamp(nowInput, 'now');
  const startsAt = isoTimestampToMillis(source.permissionStartsAt);
  const expiresAt = isoTimestampToMillis(source.permissionExpiresAt);

  if (source.killSwitch) {
    return { eligibility: 'blocked', blockReason: 'kill_switch_enabled' };
  }
  if (source.retiredAt) {
    return { eligibility: 'blocked', blockReason: 'entitlement_retired' };
  }
  if (source.lifecycle === 'suspended') {
    return { eligibility: 'blocked', blockReason: 'lifecycle_suspended' };
  }
  if (source.permissionStartsAt && startsAt === null) {
    return { eligibility: 'blocked', blockReason: 'invalid_permission_start' };
  }
  if (source.permissionExpiresAt && expiresAt === null) {
    return { eligibility: 'blocked', blockReason: 'invalid_permission_expiry' };
  }
  if (startsAt !== null && startsAt > now) {
    return { eligibility: 'pending', blockReason: 'permission_not_started' };
  }
  if (expiresAt !== null && expiresAt <= now) {
    return { eligibility: 'blocked', blockReason: 'permission_expired' };
  }
  if (source.lifecycle === 'proposed' || source.lifecycle === 'onboarding') {
    return { eligibility: 'pending', blockReason: source.lifecycle };
  }
  if (
    source.lifecycle === 'qualified' &&
    source.decisionImpact === 'enabled'
  ) {
    return { eligibility: 'decision_eligible', blockReason: null };
  }
  return { eligibility: 'shadow_only', blockReason: 'decision_impact_disabled' };
}

export function resolveDecisionBatchState(
  batch: SourcingDecisionBatch | null,
  nowInput: Date | string | number = Date.now(),
): DecisionBatchState {
  if (!batch) return 'missing';
  const now = requiredTimestamp(nowInput, 'now');
  const expiresAt = isoTimestampToMillis(batch.expiresAt);
  if (expiresAt === null || expiresAt <= now) return 'expired';
  if (batch.status === 'shadow' || batch.status === 'active') {
    return 'investigation';
  }
  return 'inactive';
}

export function isoTimestampToMillis(
  value: string | null | undefined,
): number | null {
  if (value == null || value.trim() === '') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * 배치 전체가 같은 coverage 값을 공유할 때만 배치 지표로 인정한다. 서버가 후보별로
 * 다른 값을 주기 시작하면 null 을 돌려, 배치 지표 자리에 후보 값이 새어 나가지 않게 한다.
 */
function resolveBatchSourceCoverage(
  candidates: SourcingDecisionCandidateViewModel[],
): number | null {
  if (candidates.length === 0) return null;
  const [first, ...rest] = candidates;
  if (first.confidenceKind !== 'coverage') return null;
  if (!Number.isFinite(first.confidence) || first.confidence < 0 || first.confidence > 1) {
    return null;
  }
  const uniform = rest.every(
    (candidate) =>
      candidate.confidenceKind === 'coverage'
      && candidate.confidence === first.confidence,
  );
  return uniform ? first.confidence : null;
}

function toSourceEntitlementViewModel(
  source: SourcingSourceEntitlement,
  now: number,
): SourcingSourceEntitlementViewModel {
  const entitlement = resolveSourceEntitlementEligibility(source, now);
  return {
    id: source.id,
    sourceKey: source.sourceKey,
    scopeKey: source.scopeKey,
    ownerLabel: source.ownerLabel,
    lifecycle: source.lifecycle,
    decisionImpact: source.decisionImpact,
    entitlementEligibility: entitlement.eligibility,
    entitlementBlockReason: entitlement.blockReason,
    minimumCoverageBps: source.minimumCoverageBps,
    permissionExpiresAt: source.permissionExpiresAt,
  };
}

function toCandidateViewModel(input: {
  item: SourcingDecisionBatchItem;
  batchState: DecisionBatchState;
  offer: SupplierOfferSnapshot | null;
  launchCandidate: SourcingLaunchCandidate | null;
  latestIntent: ProcurementTestIntent | null;
}): SourcingDecisionCandidateViewModel {
  const actionBlockReasons = candidateActionBlockReasons(input);
  const hasUsableBatch = input.batchState === 'investigation';
  const hasNonRejectedOffer =
    input.item.canonicalDecision !== 'reject' && input.offer !== null;

  return {
    id: input.item.id,
    rank: input.item.rank,
    productName: input.item.productName,
    decision: input.item.canonicalDecision,
    decisionLabel: decisionLabel(input.item.canonicalDecision),
    executionEligible: input.item.executionEligible,
    score: input.item.baselineScore,
    confidence: input.item.confidence,
    confidenceKind: input.item.confidenceKind,
    evidenceFamilyCount: input.item.evidenceFamilyCount,
    evidencePlatformCount: input.item.evidencePlatformCount,
    hasCoupangEvidence: input.item.hasCoupangEvidence,
    has1688Evidence: input.item.has1688Evidence,
    nextEvidenceAction: input.item.nextEvidenceAction,
    reasonCodes: input.item.reasonCodes,
    riskCodes: input.item.riskCodes,
    offer: input.offer,
    launchCandidate: input.launchCandidate,
    latestIntent: input.latestIntent,
    canRequestRfq: hasUsableBatch && hasNonRejectedOffer,
    canRequestSample:
      hasUsableBatch &&
      hasNonRejectedOffer &&
      input.offer?.identityStatus === 'exact_variant' &&
      input.offer.sampleAvailable !== false,
    actionBlockReasons,
  };
}

function candidateActionBlockReasons(input: {
  item: SourcingDecisionBatchItem;
  batchState: DecisionBatchState;
  offer: SupplierOfferSnapshot | null;
}): string[] {
  const reasons: string[] = [];
  if (input.batchState !== 'investigation') {
    reasons.push(`decision_batch_${input.batchState}`);
  }
  if (input.item.canonicalDecision === 'reject') {
    reasons.push('recommendation_rejected');
  }
  if (!input.offer) {
    reasons.push('supplier_offer_missing');
  } else if (input.offer.identityStatus !== 'exact_variant') {
    reasons.push('exact_supplier_variant_missing');
  } else if (input.offer.sampleAvailable === false) {
    reasons.push('supplier_sample_unavailable');
  }
  return reasons;
}

function indexLatestIntents(
  intents: ProcurementTestIntent[],
): Map<string, ProcurementTestIntent> {
  const byDecisionItem = new Map<string, ProcurementTestIntent>();
  for (const intent of intents) {
    const current = byDecisionItem.get(intent.decisionBatchItemId);
    if (!current || compareIntentRecency(intent, current) > 0) {
      byDecisionItem.set(intent.decisionBatchItemId, intent);
    }
  }
  return byDecisionItem;
}

function compareIntentRecency(
  left: ProcurementTestIntent,
  right: ProcurementTestIntent,
): number {
  const leftTimestamp = isoTimestampToMillis(left.createdAt) ?? -Infinity;
  const rightTimestamp = isoTimestampToMillis(right.createdAt) ?? -Infinity;
  if (leftTimestamp !== rightTimestamp) return leftTimestamp - rightTimestamp;
  return left.id.localeCompare(right.id);
}

function decisionLabel(
  decision: SourcingDecisionBatchItem['canonicalDecision'],
): string {
  switch (decision) {
    case 'test_order':
      return '테스트 검증 후보';
    case 'hold':
      return '보류';
    case 'reject':
      return '제외';
  }
}

function requiredTimestamp(
  value: Date | string | number,
  field: string,
): number {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`${field} must be a valid date or timestamp`);
  }
  return timestamp;
}
