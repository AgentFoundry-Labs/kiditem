export const SOURCING_RECOMMENDATION_DECISIONS = [
  'test_order',
  'hold',
  'reject',
] as const;

export type SourcingRecommendationDecision =
  (typeof SOURCING_RECOMMENDATION_DECISIONS)[number];

export const SOURCING_BASELINE_DECISIONS = [
  'order',
  'observe_3d',
  'exclude',
] as const;

export type SourcingBaselineDecision =
  (typeof SOURCING_BASELINE_DECISIONS)[number];

export type RecommendationConfidenceKind =
  | 'coverage'
  | 'calibrated_probability';

export type RecommendationGateStatus = 'passed' | 'unknown' | 'blocked';

export type RecommendationNextEvidenceAction =
  | 'verify_compliance'
  | 'verify_ip'
  | 'verify_qc'
  | 'resolve_unknown_risk'
  | 'complete_economics'
  | 'obtain_calibrated_probability'
  | 'add_coupang_evidence'
  | 'add_1688_evidence'
  | 'collect_supporting_evidence'
  | 'add_independent_platform_evidence'
  | 'increase_calibrated_confidence'
  | 'reassess_baseline_decision';

export interface RecommendationDecisionPolicyInput {
  baselineDecision: SourcingBaselineDecision;
  confidenceKind: RecommendationConfidenceKind;
  confidence: number;
  supportingEvidenceFamilies: readonly string[];
  supportingPlatforms: readonly string[];
  hasCoupangDemandEvidence: boolean;
  has1688SupplyEvidence: boolean;
  economics:
    | { status: 'unknown'; profitP10: null }
    | { status: 'known'; profitP10: number };
  gates: {
    compliance: RecommendationGateStatus;
    ip: RecommendationGateStatus;
    qc: RecommendationGateStatus;
  };
  blockingRiskCodes?: readonly string[];
  unknownRiskCodes?: readonly string[];
}

export interface RecommendationDecisionPolicyResult {
  decision: SourcingRecommendationDecision;
  executionEligible: boolean;
  nextEvidenceAction: RecommendationNextEvidenceAction | null;
  reasonCodes: string[];
  /** Assignment propensity belongs to a later randomized slate ledger. */
  policyProbability: null;
}

const MIN_CALIBRATED_PROBABILITY = 0.67;
const MIN_SUPPORTING_EVIDENCE_FAMILIES = 3;
const MIN_SUPPORTING_PLATFORMS = 2;

/**
 * Turn frozen recommendation evidence into the canonical sourcing action.
 * This policy intentionally cannot invent an assignment propensity: Phase 0
 * ranking is deterministic and `policyProbability` therefore remains null.
 */
export function decideSourcingRecommendation(
  input: RecommendationDecisionPolicyInput,
): RecommendationDecisionPolicyResult {
  validateInput(input);

  const blockingRiskCodes = uniqueCodes(input.blockingRiskCodes ?? []);
  const unknownRiskCodes = uniqueCodes(input.unknownRiskCodes ?? []);
  const supportingFamilies = uniqueCodes(input.supportingEvidenceFamilies);
  const supportingPlatforms = uniqueCodes(input.supportingPlatforms);

  const rejectionReasons = rejectionReasonCodes(input, blockingRiskCodes);
  if (rejectionReasons.length > 0) {
    return result('reject', false, null, rejectionReasons);
  }

  const holdReasons: string[] = [];
  let nextEvidenceAction: RecommendationNextEvidenceAction | null = null;
  const addHold = (
    reasonCode: string,
    action: RecommendationNextEvidenceAction,
  ) => {
    holdReasons.push(reasonCode);
    nextEvidenceAction ??= action;
  };

  if (input.gates.compliance === 'unknown') {
    addHold('compliance_unknown', 'verify_compliance');
  }
  if (input.gates.ip === 'unknown') {
    addHold('ip_unknown', 'verify_ip');
  }
  if (input.gates.qc === 'unknown') {
    addHold('qc_unknown', 'verify_qc');
  }
  for (const code of unknownRiskCodes) {
    addHold(`unknown_risk:${code}`, 'resolve_unknown_risk');
  }
  if (input.economics.status === 'unknown') {
    addHold('economics_unknown', 'complete_economics');
  }

  if (input.confidenceKind === 'coverage') {
    addHold(
      'coverage_confidence_not_executable',
      'obtain_calibrated_probability',
    );
  } else if (input.confidence < MIN_CALIBRATED_PROBABILITY) {
    addHold(
      'calibrated_probability_below_threshold',
      'increase_calibrated_confidence',
    );
  }

  if (!input.hasCoupangDemandEvidence) {
    addHold('coupang_demand_evidence_missing', 'add_coupang_evidence');
  }
  if (!input.has1688SupplyEvidence) {
    addHold('1688_supply_evidence_missing', 'add_1688_evidence');
  }
  if (supportingFamilies.length < MIN_SUPPORTING_EVIDENCE_FAMILIES) {
    addHold(
      'supporting_evidence_families_below_minimum',
      'collect_supporting_evidence',
    );
  }
  if (supportingPlatforms.length < MIN_SUPPORTING_PLATFORMS) {
    addHold(
      'supporting_platforms_below_minimum',
      'add_independent_platform_evidence',
    );
  }
  if (input.baselineDecision !== 'order') {
    addHold('baseline_decision_not_order', 'reassess_baseline_decision');
  }

  if (holdReasons.length > 0) {
    return result('hold', false, nextEvidenceAction, holdReasons);
  }

  return result(
    'test_order',
    true,
    null,
    ['all_test_order_gates_passed'],
  );
}

function rejectionReasonCodes(
  input: RecommendationDecisionPolicyInput,
  blockingRiskCodes: string[],
): string[] {
  const reasons: string[] = [];
  if (input.baselineDecision === 'exclude') {
    reasons.push('baseline_model_excluded');
  }
  if (input.gates.compliance === 'blocked') {
    reasons.push('compliance_blocked');
  }
  if (input.gates.ip === 'blocked') {
    reasons.push('ip_blocked');
  }
  if (input.gates.qc === 'blocked') {
    reasons.push('qc_blocked');
  }
  for (const code of blockingRiskCodes) {
    reasons.push(`blocking_risk:${code}`);
  }
  if (input.economics.status === 'known' && input.economics.profitP10 <= 0) {
    reasons.push('profit_p10_not_positive');
  }
  return reasons;
}

function validateInput(input: RecommendationDecisionPolicyInput): void {
  if (
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1
  ) {
    throw new TypeError('Recommendation confidence must be between 0 and 1.');
  }
  if (
    input.economics.status === 'known' &&
    !Number.isFinite(input.economics.profitP10)
  ) {
    throw new TypeError('Known profit P10 must be a finite number.');
  }
}

function uniqueCodes(values: readonly string[]): string[] {
  return Array.from(new Set(values
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)));
}

function result(
  decision: SourcingRecommendationDecision,
  executionEligible: boolean,
  nextEvidenceAction: RecommendationNextEvidenceAction | null,
  reasonCodes: string[],
): RecommendationDecisionPolicyResult {
  return {
    decision,
    executionEligible,
    nextEvidenceAction,
    reasonCodes,
    policyProbability: null,
  };
}
