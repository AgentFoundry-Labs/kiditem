export type MasterProductAbcGrade = 'A' | 'B' | 'C';

export type MasterProductAbcPolicyThresholds = {
  aCumulativeThreshold: number;
  bCumulativeThreshold: number;
};

export type MasterProductAbcEvidence = {
  masterProductId: string;
  metricValue: number | null;
  eligible: boolean;
};

type RankedEvidence = MasterProductAbcEvidence & { metricValue: number };

function hasUsableMetricValue(
  evidence: MasterProductAbcEvidence,
): evidence is RankedEvidence {
  return (
    evidence.eligible &&
    evidence.metricValue !== null &&
    Number.isFinite(evidence.metricValue) &&
    evidence.metricValue >= 0
  );
}

function gradeForCumulativeShare(
  cumulativeShareBeforeGroup: number,
  policy: MasterProductAbcPolicyThresholds,
): MasterProductAbcGrade {
  if (cumulativeShareBeforeGroup < policy.aCumulativeThreshold / 100) {
    return 'A';
  }
  if (cumulativeShareBeforeGroup < policy.bCumulativeThreshold / 100) {
    return 'B';
  }
  return 'C';
}

/**
 * Calculates one deterministic, organization-scoped ABC publication candidate.
 * Equal metric values are deliberately assigned together using the cumulative
 * share before their complete score group.
 */
export function calculateMasterProductAbcGrades(
  policy: MasterProductAbcPolicyThresholds,
  evidence: readonly MasterProductAbcEvidence[],
): Map<string, MasterProductAbcGrade | null> {
  const grades = new Map<string, MasterProductAbcGrade | null>();
  const evidenceByProductId = new Map<string, MasterProductAbcEvidence>();

  for (const row of evidence) {
    evidenceByProductId.set(row.masterProductId, row);
  }
  for (const masterProductId of [...evidenceByProductId.keys()].sort()) {
    grades.set(masterProductId, null);
  }

  const ranked = [...evidenceByProductId.values()]
    .filter(hasUsableMetricValue)
    .sort(
      (left, right) =>
        right.metricValue - left.metricValue ||
        left.masterProductId.localeCompare(right.masterProductId),
    );
  const total = ranked.reduce((sum, row) => sum + row.metricValue, 0);
  if (total <= 0) return grades;

  let cumulativeValue = 0;
  for (let start = 0; start < ranked.length;) {
    const score = ranked[start].metricValue;
    let end = start + 1;
    while (end < ranked.length && ranked[end].metricValue === score) end += 1;

    const grade = gradeForCumulativeShare(cumulativeValue / total, policy);
    for (const row of ranked.slice(start, end)) {
      grades.set(row.masterProductId, grade);
    }
    cumulativeValue += ranked
      .slice(start, end)
      .reduce((sum, row) => sum + row.metricValue, 0);
    start = end;
  }

  return grades;
}
