import type { ProductAbcFormulaSummary } from '@kiditem/shared/product-abc';
import {
  buildQuantileKnots,
  calculateProfitabilityScore,
  calculateWeightedProfitabilityMetrics,
  canonicalJson,
  sha256CanonicalJson,
  type ProfitabilityContributionFact,
  type ProfitabilityFormulaParameters,
} from './master-product-profitability-score';

export const PRODUCT_ABC_CALCULATION_MANIFEST = {
  codeVersion: 'ABC_V1',
  sourceGrain: 'SELLPIA_PRODUCT_OPTION_MONTH',
  decay: 'EXPONENTIAL_HALF_LIFE',
  normalization: 'FROZEN_LINEAR_QUANTILE_KNOTS',
  reliability: 'GEOMETRIC_ORDER_DAY_SHRINKAGE',
  boundaries: 'TIE_SAFE_ORDERED_ONE_DIMENSIONAL_SEGMENTATION',
  hardGuard: 'NON_POSITIVE_WEIGHTED_CONTRIBUTION_IS_C',
} as const;

export const PRODUCT_ABC_CALCULATION_CODE_CHECKSUM = sha256CanonicalJson(
  PRODUCT_ABC_CALCULATION_MANIFEST,
);

export type ProductAbcCalibrationExample = Readonly<{
  masterProductId: string;
  originMonth: string;
  asOfDate: Date;
  facts: readonly ProfitabilityContributionFact[];
  paidOrderCount: number;
  observationDays: number;
  nextMonthProfitVelocity: number;
}>;

export type ProductAbcCalibrationCandidate = Readonly<{
  halfLifeDays: number;
  weights: Readonly<{ profit: number; margin: number; persistence: number }>;
  orderShrinkK: number;
  dayShrinkK: number;
}>;

export type ProductAbcCalibrationResult = Readonly<{
  formula: ProductAbcFormulaSummary;
  report: Readonly<{
    candidateCount: number;
    viableCandidateCount: number;
    originMonths: readonly string[];
  }>;
}>;

type ScoredExample = Readonly<{
  example: ProductAbcCalibrationExample;
  score: number;
  label: number;
}>;

type Cutoffs = Readonly<{ cToB: number; bToA: number }>;

/**
 * Fits formula parameters only from rolling-origin examples. The returned formula
 * is immutable; evaluation always consumes its stored knots and cutoffs.
 */
export function calibrateProductAbcFormula(input: {
  examples: readonly ProductAbcCalibrationExample[];
  version: number;
  activatedAt: Date;
  candidates?: readonly ProductAbcCalibrationCandidate[];
}): ProductAbcCalibrationResult | null {
  const examples = normalizeExamples(input.examples);
  const originMonths = [...new Set(examples.map((example) => example.originMonth))].sort();
  if (examples.length < 30 || originMonths.length < 3) return null;
  const candidates = input.candidates ?? productAbcCandidateGrid();
  const viable: Array<{
    candidate: ProductAbcCalibrationCandidate;
    metrics: ValidationMetrics;
  }> = [];
  for (const candidate of candidates) {
    const metrics = validateCandidate(candidate, examples, originMonths);
    if (metrics) viable.push({ candidate, metrics });
  }
  if (viable.length === 0) return null;
  viable.sort(compareCandidateOutcome);
  const selected = viable[0]!;
  const formula = refitFormula({
    candidate: selected.candidate,
    examples,
    originMonths,
    version: input.version,
    activatedAt: input.activatedAt,
    metrics: selected.metrics,
  });
  return {
    formula,
    report: {
      candidateCount: candidates.length,
      viableCandidateCount: viable.length,
      originMonths,
    },
  };
}

export function productAbcCandidateGrid(): ProductAbcCalibrationCandidate[] {
  const candidates: ProductAbcCalibrationCandidate[] = [];
  for (let halfLifeDays = 30; halfLifeDays <= 365; halfLifeDays += 5) {
    for (let profit = 0; profit <= 20; profit += 1) {
      for (let margin = 0; margin <= 20 - profit; margin += 1) {
        const persistence = 20 - profit - margin;
        if (profit < margin || profit < persistence) continue;
        for (const orderShrinkK of [5, 10, 20, 40, 80]) {
          for (const dayShrinkK of [7, 14, 30, 60, 120]) {
            candidates.push({
              halfLifeDays,
              weights: { profit: profit / 20, margin: margin / 20, persistence: persistence / 20 },
              orderShrinkK,
              dayShrinkK,
            });
          }
        }
      }
    }
  }
  return candidates;
}

function normalizeExamples(examples: readonly ProductAbcCalibrationExample[]): ProductAbcCalibrationExample[] {
  return [...examples]
    .filter((example) => Number.isFinite(example.nextMonthProfitVelocity))
    .sort((left, right) => left.originMonth.localeCompare(right.originMonth)
      || left.masterProductId.localeCompare(right.masterProductId));
}

function validateCandidate(
  candidate: ProductAbcCalibrationCandidate,
  examples: readonly ProductAbcCalibrationExample[],
  originMonths: readonly string[],
): ValidationMetrics | null {
  const foldMetrics: ValidationMetrics[] = [];
  for (const originMonth of originMonths.slice(1)) {
    const training = examples.filter((example) => example.originMonth < originMonth);
    const validation = examples.filter((example) => example.originMonth === originMonth);
    if (training.length < 3 || validation.length < 3) continue;
    const parameters = fitParameters(candidate, training);
    const trainingScores = scoreExamples(training, parameters);
    const cutoffs = chooseCutoffs(trainingScores);
    if (!cutoffs) continue;
    const validationScores = scoreExamples(validation, parameters);
    const evaluated = evaluateFold(validationScores, cutoffs);
    if (!evaluated) return null;
    foldMetrics.push(evaluated);
  }
  if (foldMetrics.length === 0) return null;
  return {
    meanSpearmanRankCorrelation: mean(foldMetrics.map((metric) => metric.meanSpearmanRankCorrelation)),
    meanExplainedVariance: mean(foldMetrics.map((metric) => metric.meanExplainedVariance)),
    gradeChurnRate: mean(foldMetrics.map((metric) => metric.gradeChurnRate)),
  };
}

function fitParameters(
  candidate: ProductAbcCalibrationCandidate,
  examples: readonly ProductAbcCalibrationExample[],
): ProfitabilityFormulaParameters {
  const metrics = examples.map((example) => calculateWeightedProfitabilityMetrics({
    facts: example.facts,
    asOfDate: example.asOfDate,
    halfLifeDays: candidate.halfLifeDays,
  }));
  const validMetrics = metrics.filter((metric) => metric.contributionMargin !== null);
  if (validMetrics.length < 3) throw new Error('Calibration requires non-zero revenue examples');
  return {
    ...candidate,
    normalizationKnots: {
      profitVelocity: buildQuantileKnots(validMetrics.map((metric) => metric.profitVelocity30)),
      contributionMargin: buildQuantileKnots(validMetrics.map((metric) => metric.contributionMargin!)),
      lossRecurrence: buildQuantileKnots(validMetrics.map((metric) => metric.lossRecurrence)),
    },
  };
}

function scoreExamples(
  examples: readonly ProductAbcCalibrationExample[],
  parameters: ProfitabilityFormulaParameters,
): ScoredExample[] {
  return examples.flatMap((example): ScoredExample[] => {
    const score = calculateProfitabilityScore({
      facts: example.facts,
      asOfDate: example.asOfDate,
      formula: parameters,
      paidOrderCount: example.paidOrderCount,
      observationDays: example.observationDays,
    });
    return score.adjustedScore === null ? [] : [{
      example,
      score: score.adjustedScore,
      label: example.nextMonthProfitVelocity,
    }];
  });
}

function chooseCutoffs(scored: readonly ScoredExample[]): Cutoffs | null {
  const groups = groupByScore(scored);
  if (groups.length < 3) return null;
  let best: { cutoffs: Cutoffs; sse: number } | null = null;
  for (let middleStart = 1; middleStart <= groups.length - 2; middleStart += 1) {
    for (let highStart = middleStart + 1; highStart <= groups.length - 1; highStart += 1) {
      const low = groups.slice(0, middleStart).flatMap((group) => group.rows);
      const middle = groups.slice(middleStart, highStart).flatMap((group) => group.rows);
      const high = groups.slice(highStart).flatMap((group) => group.rows);
      if (low.length === 0 || middle.length === 0 || high.length === 0) continue;
      const sse = groupSse(low) + groupSse(middle) + groupSse(high);
      const cutoffs = {
        cToB: groups[middleStart]!.score,
        bToA: groups[highStart]!.score,
      };
      if (!best || sse < best.sse || (sse === best.sse && canonicalJson(cutoffs) < canonicalJson(best.cutoffs))) {
        best = { cutoffs, sse };
      }
    }
  }
  return best?.cutoffs ?? null;
}

function evaluateFold(scored: readonly ScoredExample[], cutoffs: Cutoffs): ValidationMetrics | null {
  const byGrade = {
    A: scored.filter((row) => row.score >= cutoffs.bToA),
    B: scored.filter((row) => row.score >= cutoffs.cToB && row.score < cutoffs.bToA),
    C: scored.filter((row) => row.score < cutoffs.cToB),
  };
  if (byGrade.A.length === 0 || byGrade.B.length === 0 || byGrade.C.length === 0) return null;
  const meanA = mean(byGrade.A.map((row) => row.label));
  const meanB = mean(byGrade.B.map((row) => row.label));
  const meanC = mean(byGrade.C.map((row) => row.label));
  if (!(meanA > meanB && meanB > meanC)) return null;
  const all = [...byGrade.A, ...byGrade.B, ...byGrade.C];
  const totalMean = mean(all.map((row) => row.label));
  const totalSse = all.reduce((sum, row) => sum + (row.label - totalMean) ** 2, 0);
  const withinSse = groupSse(byGrade.A) + groupSse(byGrade.B) + groupSse(byGrade.C);
  return {
    meanSpearmanRankCorrelation: spearman(all.map((row) => row.score), all.map((row) => row.label)),
    meanExplainedVariance: totalSse === 0 ? 0 : Math.max(0, 1 - withinSse / totalSse),
    gradeChurnRate: gradeChurn(all, cutoffs),
  };
}

function refitFormula(input: {
  candidate: ProductAbcCalibrationCandidate;
  examples: readonly ProductAbcCalibrationExample[];
  originMonths: readonly string[];
  version: number;
  activatedAt: Date;
  metrics: ValidationMetrics;
}): ProductAbcFormulaSummary {
  const parameters = fitParameters(input.candidate, input.examples);
  const cutoffs = chooseCutoffs(scoreExamples(input.examples, parameters));
  if (!cutoffs) throw new Error('Selected calibration candidate has no refit cutoffs');
  const base = {
    formulaKey: 'ABC_V1' as const,
    version: input.version,
    calculationCodeChecksum: PRODUCT_ABC_CALCULATION_CODE_CHECKSUM,
    activatedAt: input.activatedAt.toISOString(),
    halfLifeDays: input.candidate.halfLifeDays,
    weights: input.candidate.weights,
    orderShrinkK: input.candidate.orderShrinkK,
    dayShrinkK: input.candidate.dayShrinkK,
    cutoffs,
    normalizationKnots: {
      profitVelocity: parameters.normalizationKnots.profitVelocity.map((knot) => ({ ...knot })),
      contributionMargin: parameters.normalizationKnots.contributionMargin.map((knot) => ({ ...knot })),
      lossRecurrence: parameters.normalizationKnots.lossRecurrence.map((knot) => ({ ...knot })),
    },
    trainingRange: {
      from: `${input.originMonths[0]}-01`,
      to: `${input.originMonths[input.originMonths.length - 1]}-01`,
    },
    sampleCount: input.examples.length,
    foldCount: input.originMonths.length - 1,
    calibrationMetrics: input.metrics,
  };
  return { ...base, formulaChecksum: sha256CanonicalJson(base) };
}

function groupByScore(scored: readonly ScoredExample[]) {
  const groups = new Map<number, ScoredExample[]>();
  for (const row of scored) {
    const rows = groups.get(row.score) ?? [];
    rows.push(row);
    groups.set(row.score, rows);
  }
  return [...groups.entries()]
    .map(([score, rows]) => ({ score, rows }))
    .sort((left, right) => left.score - right.score);
}

function groupSse(rows: readonly ScoredExample[]): number {
  const average = mean(rows.map((row) => row.label));
  return rows.reduce((sum, row) => sum + (row.label - average) ** 2, 0);
}

function gradeChurn(rows: readonly ScoredExample[], cutoffs: Cutoffs): number {
  const byProduct = new Map<string, Array<{ originMonth: string; grade: string }>>();
  for (const row of rows) {
    const grade = row.score >= cutoffs.bToA ? 'A' : row.score >= cutoffs.cToB ? 'B' : 'C';
    const values = byProduct.get(row.example.masterProductId) ?? [];
    values.push({ originMonth: row.example.originMonth, grade });
    byProduct.set(row.example.masterProductId, values);
  }
  let transitions = 0;
  let changes = 0;
  for (const values of byProduct.values()) {
    values.sort((left, right) => left.originMonth.localeCompare(right.originMonth));
    for (let index = 1; index < values.length; index += 1) {
      transitions += 1;
      if (values[index - 1]!.grade !== values[index]!.grade) changes += 1;
    }
  }
  return transitions === 0 ? 0 : changes / transitions;
}

function spearman(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length < 2) return 0;
  const leftRanks = rank(left);
  const rightRanks = rank(right);
  const leftMean = mean(leftRanks);
  const rightMean = mean(rightRanks);
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < leftRanks.length; index += 1) {
    const leftDelta = leftRanks[index]! - leftMean;
    const rightDelta = rightRanks[index]! - rightMean;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }
  return leftVariance === 0 || rightVariance === 0 ? 0 : numerator / Math.sqrt(leftVariance * rightVariance);
}

function rank(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value);
  const ranks = Array<number>(values.length);
  for (let start = 0; start < order.length;) {
    let end = start + 1;
    while (end < order.length && order[end]!.value === order[start]!.value) end += 1;
    const averageRank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) ranks[order[index]!.index] = averageRank;
    start = end;
  }
  return ranks;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function compareCandidateOutcome(
  left: { candidate: ProductAbcCalibrationCandidate; metrics: ValidationMetrics },
  right: { candidate: ProductAbcCalibrationCandidate; metrics: ValidationMetrics },
): number {
  return right.metrics.meanSpearmanRankCorrelation - left.metrics.meanSpearmanRankCorrelation
    || right.metrics.meanExplainedVariance - left.metrics.meanExplainedVariance
    || left.metrics.gradeChurnRate - right.metrics.gradeChurnRate
    || left.candidate.halfLifeDays - right.candidate.halfLifeDays
    || canonicalJson(left.candidate).localeCompare(canonicalJson(right.candidate));
}

type ValidationMetrics = Readonly<{
  meanSpearmanRankCorrelation: number;
  meanExplainedVariance: number;
  gradeChurnRate: number;
}>;
