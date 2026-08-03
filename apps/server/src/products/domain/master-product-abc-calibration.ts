import type { ProductAbcFormulaSummary } from '@kiditem/shared/product-abc';
import {
  buildQuantileKnots,
  calculateWeightedProfitabilityMetrics,
  sha256CanonicalJson,
  type ProfitabilityContributionFact,
} from './master-product-profitability-score';

export const PRODUCT_ABC_CALCULATION_MANIFEST = {
  codeVersion: 'ABC_V1_FIXED_QUANTILE',
  sourceGrain: 'SELLPIA_PRODUCT_OPTION_MONTH',
  decay: 'EXPONENTIAL_HALF_LIFE',
  normalization: 'FROZEN_HISTORICAL_QUANTILE_KNOTS',
  reliability: 'OBSERVATION_DAY_SHRINKAGE',
  weights: 'FIXED_50_30_20',
  boundaries: 'ACTIVE_POSITIVE_PRODUCT_SCORE_QUANTILES_20_50_30',
  hardGuard: 'NON_POSITIVE_WEIGHTED_CONTRIBUTION_IS_C',
} as const;

export const PRODUCT_ABC_CALCULATION_CODE_CHECKSUM = sha256CanonicalJson(
  PRODUCT_ABC_CALCULATION_MANIFEST,
);

export type ProductAbcFormulaObservation = Readonly<{
  masterProductId: string;
  facts: readonly ProfitabilityContributionFact[];
  asOfDate: Date;
  observationDays: number;
}>;

export type ProductAbcFixedFormulaResult = Readonly<{
  formula: ProductAbcFormulaSummary;
  observationCount: number;
}>;

const FIXED_PARAMETERS = {
  halfLifeDays: 90,
  weights: { profit: 0.5, margin: 0.3, persistence: 0.2 },
  dayShrinkK: 30,
  // These are percentile boundaries, not absolute score thresholds. Products
  // assigns the current active positive-product cohort at publication time.
  cutoffs: { cToB: 30, bToA: 80 },
} as const;

/**
 * Builds the one organization-owned formula without a predictive model.
 * Weights and grade proportions are fixed operational policy; only the frozen
 * score normalization is derived from complete Sellpia profitability history.
 */
export function createFixedProductAbcFormula(input: {
  observations: readonly ProductAbcFormulaObservation[];
  version: number;
  activatedAt: Date;
}): ProductAbcFixedFormulaResult | null {
  const observations = [...input.observations]
    .filter((observation) => observation.facts.length > 0)
    .sort((left, right) => left.masterProductId.localeCompare(right.masterProductId));
  const metrics = observations.map((observation) => ({
    observation,
    metrics: calculateWeightedProfitabilityMetrics({
      facts: observation.facts,
      asOfDate: observation.asOfDate,
      halfLifeDays: FIXED_PARAMETERS.halfLifeDays,
    }),
  })).filter((entry) => entry.metrics.contributionMargin !== null);
  if (metrics.length < 3) return null;

  const trainingStart = new Date(Math.min(...metrics.flatMap((entry) =>
    entry.observation.facts.map((fact) => fact.coverageStartDate.getTime()))));
  const trainingEnd = new Date(Math.max(...metrics.map((entry) => entry.observation.asOfDate.getTime())));
  const base = {
    formulaKey: 'ABC_V1' as const,
    version: input.version,
    calculationCodeChecksum: PRODUCT_ABC_CALCULATION_CODE_CHECKSUM,
    activatedAt: input.activatedAt.toISOString(),
    halfLifeDays: FIXED_PARAMETERS.halfLifeDays,
    weights: FIXED_PARAMETERS.weights,
    dayShrinkK: FIXED_PARAMETERS.dayShrinkK,
    cutoffs: FIXED_PARAMETERS.cutoffs,
    normalizationKnots: {
      profitVelocity: buildQuantileKnots(metrics.map((entry) => entry.metrics.profitVelocity30)),
      contributionMargin: buildQuantileKnots(metrics.map((entry) => entry.metrics.contributionMargin!)),
      lossRecurrence: buildQuantileKnots(metrics.map((entry) => entry.metrics.lossRecurrence)),
    },
    trainingRange: {
      from: calendarDate(trainingStart),
      to: calendarDate(trainingEnd),
    },
    sampleCount: metrics.length,
    foldCount: 0,
    calibrationMethod: 'FIXED_QUANTILE' as const,
    calibrationMetrics: {
      meanSpearmanRankCorrelation: 0,
      meanExplainedVariance: 0,
      gradeChurnRate: 0,
    },
  };
  return {
    formula: { ...base, formulaChecksum: sha256CanonicalJson(base) },
    observationCount: metrics.length,
  };
}

function calendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
