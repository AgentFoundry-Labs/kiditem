import type {
  MasterProductAbcConfidence,
  MasterProductAbcEligibilityReason,
  MasterProductAbcEvaluation,
  MasterProductAbcLifecycleStage,
  MasterProductAbcRiskFlag,
  ProductAbcGrade,
} from '@kiditem/shared/product-abc';

export type MasterProductAbcPolicyThresholds = {
  aCumulativeThreshold: number;
  bCumulativeThreshold: number;
  minProvisionalMonths: number;
  minClassifiedMonths: number;
};

export type MasterProductAbcEvidence = {
  masterProductId: string;
  periodMetricValue: number | null;
  rankingValue: number | null;
  grossRevenue: number | null;
  grossCost: number | null;
  grossProfit: number | null;
  observedCompleteMonths: number;
  observationStartMonth: string | null;
  eligible: boolean;
  eligibilityReason: MasterProductAbcEligibilityReason;
  riskFlags: readonly MasterProductAbcRiskFlag[];
};

export type MasterProductAbcEvaluationPublication = Readonly<{
  grades: ReadonlyMap<string, ProductAbcGrade | null>;
  evaluations: ReadonlyMap<string, MasterProductAbcEvaluation>;
}>;

type RankedEvaluation = Readonly<{
  masterProductId: string;
  rankingValue: number;
}>;

type ScoredGroup = Readonly<{
  score: number;
  grade: ProductAbcGrade;
  rows: readonly RankedEvaluation[];
}>;

export function annualizeMetric(value: number, observedCompleteMonths: number): number {
  if (observedCompleteMonths >= 6 && observedCompleteMonths < 12) {
    return (value / observedCompleteMonths) * 12;
  }
  return value;
}

/**
 * Calculates Products-owned lifecycle evaluations. Only established, eligible,
 * positive contributors make the official ABC denominator; provisional products
 * are compared with that established cohort but never alter it.
 */
export function calculateMasterProductAbcEvaluations(
  policy: MasterProductAbcPolicyThresholds,
  evidence: readonly MasterProductAbcEvidence[],
  timestamps: Readonly<{ calculatedAt: Date; sourceCapturedAt: Date | null }>,
): MasterProductAbcEvaluationPublication {
  const evidenceByProductId = new Map<string, MasterProductAbcEvidence>();
  for (const row of evidence) evidenceByProductId.set(row.masterProductId, row);

  const evaluations = new Map<string, MasterProductAbcEvaluation>();
  for (const [masterProductId, row] of [...evidenceByProductId.entries()]
    .sort(([left], [right]) => left.localeCompare(right))) {
    const lifecycleStage = lifecycleFor(row.observedCompleteMonths, policy);
    const rankingValue = row.eligible && row.rankingValue !== null
      && Number.isFinite(row.rankingValue)
      ? annualizeMetric(row.rankingValue, row.observedCompleteMonths)
      : null;
    const riskFlags = riskFlagsFor(row, rankingValue);
    evaluations.set(masterProductId, {
      abcGrade: null,
      provisionalGrade: null,
      lifecycleStage,
      confidence: confidenceFor(row.observedCompleteMonths),
      eligibilityReason: row.eligibilityReason,
      riskFlags,
      observedCompleteMonths: Math.min(Math.max(row.observedCompleteMonths, 0), 12),
      observationStartMonth: row.observationStartMonth,
      periodMetricValue: finiteOrNull(row.periodMetricValue),
      rankingValue,
      grossRevenue: integerOrNull(row.grossRevenue),
      grossCost: integerOrNull(row.grossCost),
      grossProfit: integerOrNull(row.grossProfit),
      grossMarginRate: grossMarginRate(row.grossRevenue, row.grossProfit),
      contributionRate: null,
      cumulativeContributionRate: null,
      calculatedAt: timestamps.calculatedAt,
      sourceCapturedAt: timestamps.sourceCapturedAt,
    });
  }

  const officialCandidates = [...evaluations.entries()]
    .flatMap(([masterProductId, evaluation]): RankedEvaluation[] =>
      isOfficialCandidate(evaluation)
        ? [{ masterProductId, rankingValue: evaluation.rankingValue! }]
        : [])
    .sort(compareRankedEvaluations);
  const total = officialCandidates.reduce((sum, row) => sum + row.rankingValue, 0);
  const groups = total > 0 ? scoreGroups(officialCandidates, policy, total) : [];

  let cumulativeValue = 0;
  for (const group of groups) {
    const groupValue = group.rows.reduce((sum, row) => sum + row.rankingValue, 0);
    const cumulativeContributionRate = ((cumulativeValue + groupValue) / total) * 100;
    for (const row of group.rows) {
      const evaluation = evaluations.get(row.masterProductId)!;
      evaluations.set(row.masterProductId, {
        ...evaluation,
        abcGrade: group.grade,
        contributionRate: (row.rankingValue / total) * 100,
        cumulativeContributionRate,
      });
    }
    cumulativeValue += groupValue;
  }

  for (const [masterProductId, evaluation] of evaluations) {
    if (!isProvisionalCandidate(evaluation) || groups.length === 0) continue;
    evaluations.set(masterProductId, {
      ...evaluation,
      provisionalGrade: provisionalGradeFor(evaluation.rankingValue!, groups),
    });
  }

  return {
    grades: new Map([...evaluations.entries()].map(([masterProductId, evaluation]) => [
      masterProductId,
      evaluation.abcGrade,
    ])),
    evaluations,
  };
}

function lifecycleFor(
  observedCompleteMonths: number,
  policy: MasterProductAbcPolicyThresholds,
): MasterProductAbcLifecycleStage {
  if (observedCompleteMonths < policy.minProvisionalMonths) return 'NEW';
  if (observedCompleteMonths < policy.minClassifiedMonths) return 'PROVISIONAL';
  return 'ESTABLISHED';
}

function confidenceFor(observedCompleteMonths: number): MasterProductAbcConfidence {
  if (observedCompleteMonths < 6) return 'LOW';
  if (observedCompleteMonths < 12) return 'MEDIUM';
  return 'HIGH';
}

function riskFlagsFor(
  evidence: MasterProductAbcEvidence,
  rankingValue: number | null,
): MasterProductAbcRiskFlag[] {
  const flags = new Set(evidence.riskFlags);
  if (evidence.observedCompleteMonths < 12) flags.add('LIMITED_HISTORY');
  if (rankingValue === 0) flags.add('ZERO_VALUE');
  if (rankingValue !== null && rankingValue < 0) flags.add('LOSS');
  return [...flags].sort();
}

function isOfficialCandidate(evaluation: MasterProductAbcEvaluation): boolean {
  return evaluation.lifecycleStage === 'ESTABLISHED'
    && evaluation.eligibilityReason === 'ELIGIBLE'
    && evaluation.rankingValue !== null
    && evaluation.rankingValue > 0;
}

function isProvisionalCandidate(evaluation: MasterProductAbcEvaluation): boolean {
  return evaluation.lifecycleStage === 'PROVISIONAL'
    && evaluation.eligibilityReason === 'ELIGIBLE'
    && evaluation.rankingValue !== null
    && evaluation.rankingValue > 0;
}

function compareRankedEvaluations(left: RankedEvaluation, right: RankedEvaluation): number {
  return right.rankingValue - left.rankingValue
    || left.masterProductId.localeCompare(right.masterProductId);
}

function scoreGroups(
  ranked: readonly RankedEvaluation[],
  policy: MasterProductAbcPolicyThresholds,
  total: number,
): ScoredGroup[] {
  const groups: ScoredGroup[] = [];
  let cumulativeValue = 0;
  for (let start = 0; start < ranked.length;) {
    const score = ranked[start].rankingValue;
    let end = start + 1;
    while (end < ranked.length && ranked[end].rankingValue === score) end += 1;
    const rows = ranked.slice(start, end);
    groups.push({
      score,
      grade: gradeForCumulativeShare(cumulativeValue / total, policy),
      rows,
    });
    cumulativeValue += rows.reduce((sum, row) => sum + row.rankingValue, 0);
    start = end;
  }
  return groups;
}

function gradeForCumulativeShare(
  cumulativeShareBeforeGroup: number,
  policy: MasterProductAbcPolicyThresholds,
): ProductAbcGrade {
  if (cumulativeShareBeforeGroup < policy.aCumulativeThreshold / 100) return 'A';
  if (cumulativeShareBeforeGroup < policy.bCumulativeThreshold / 100) return 'B';
  return 'C';
}

function provisionalGradeFor(
  rankingValue: number,
  establishedGroups: readonly ScoredGroup[],
): ProductAbcGrade {
  return establishedGroups.find((group) => rankingValue >= group.score)?.grade ?? 'C';
}

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function integerOrNull(value: number | null): number | null {
  return value !== null && Number.isInteger(value) ? value : null;
}

function grossMarginRate(revenue: number | null, profit: number | null): number | null {
  if (revenue === null || profit === null || revenue <= 0) return null;
  return (profit / revenue) * 100;
}
