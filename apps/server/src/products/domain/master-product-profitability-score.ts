import { createHash } from 'node:crypto';

export type ProfitabilityFormulaParameters = Readonly<{
  halfLifeDays: number;
  weights: Readonly<{ profit: number; margin: number; persistence: number }>;
  orderShrinkK: number;
  dayShrinkK: number;
  normalizationKnots: Readonly<{
    profitVelocity: readonly NormalizationKnot[];
    contributionMargin: readonly NormalizationKnot[];
    lossRecurrence: readonly NormalizationKnot[];
  }>;
}>;

export type NormalizationKnot = Readonly<{ value: number; score: number }>;

export type ProfitabilityContributionFact = Readonly<{
  coverageStartDate: Date;
  coverageEndDate: Date;
  coveredDays: number;
  revenue: number;
  orderTimeCogs: number;
  adSpend: number;
  contributionProfit: number;
  negativeCoveredDays: number;
}>;

export type WeightedProfitabilityMetrics = Readonly<{
  weightedRevenue: number;
  weightedOrderTimeCogs: number;
  weightedAdSpend: number;
  weightedContributionProfit: number;
  profitVelocity30: number;
  contributionMargin: number | null;
  lossRecurrence: number;
  coveredDays: number;
}>;

export type ProfitabilityScore = Readonly<{
  metrics: WeightedProfitabilityMetrics;
  normalizedProfitVelocity: number;
  normalizedContributionMargin: number | null;
  normalizedLossRecurrence: number;
  rawScore: number | null;
  reliability: number;
  adjustedScore: number | null;
}>;

const MILLISECONDS_PER_DAY = 86_400_000;

export function calculateWeightedProfitabilityMetrics(input: {
  facts: readonly ProfitabilityContributionFact[];
  asOfDate: Date;
  halfLifeDays: number;
}): WeightedProfitabilityMetrics {
  assertFinitePositive(input.halfLifeDays, 'halfLifeDays');
  if (input.facts.length === 0) throw new Error('At least one contribution fact is required');
  let weightTotal = 0;
  let weightedDays = 0;
  let weightedRevenue = 0;
  let weightedOrderTimeCogs = 0;
  let weightedAdSpend = 0;
  let weightedContributionProfit = 0;
  let weightedNegativeDays = 0;
  const cutoffEpochDay = epochDay(input.asOfDate);
  for (const fact of input.facts) {
    assertContributionFact(fact);
    const midpoint = (epochDay(fact.coverageStartDate) + epochDay(fact.coverageEndDate)) / 2;
    const ageDays = Math.max(0, cutoffEpochDay - midpoint);
    const weight = 2 ** (-ageDays / input.halfLifeDays);
    weightTotal += weight;
    weightedDays += weight * fact.coveredDays;
    weightedRevenue += weight * fact.revenue;
    weightedOrderTimeCogs += weight * fact.orderTimeCogs;
    weightedAdSpend += weight * fact.adSpend;
    weightedContributionProfit += weight * fact.contributionProfit;
    weightedNegativeDays += weight * fact.negativeCoveredDays;
  }
  if (!Number.isFinite(weightTotal) || weightedDays <= 0) {
    throw new Error('Contribution facts produced an invalid weighted denominator');
  }
  if (weightedRevenue === 0 && weightedContributionProfit > 0) {
    throw new Error('Positive contribution profit with zero recognized revenue is impossible');
  }
  return {
    weightedRevenue,
    weightedOrderTimeCogs,
    weightedAdSpend,
    weightedContributionProfit,
    profitVelocity30: 30 * weightedContributionProfit / weightedDays,
    contributionMargin: weightedRevenue === 0 ? null : weightedContributionProfit / weightedRevenue,
    lossRecurrence: weightedNegativeDays / weightedDays,
    coveredDays: weightedDays,
  };
}

export function calculateProfitabilityScore(input: {
  facts: readonly ProfitabilityContributionFact[];
  asOfDate: Date;
  formula: ProfitabilityFormulaParameters;
  paidOrderCount: number;
  observationDays: number;
}): ProfitabilityScore {
  validateFormulaParameters(input.formula);
  if (!Number.isInteger(input.paidOrderCount) || input.paidOrderCount < 0) {
    throw new Error('paidOrderCount must be a non-negative integer');
  }
  if (!Number.isInteger(input.observationDays) || input.observationDays < 0) {
    throw new Error('observationDays must be a non-negative integer');
  }
  const metrics = calculateWeightedProfitabilityMetrics({
    facts: input.facts,
    asOfDate: input.asOfDate,
    halfLifeDays: input.formula.halfLifeDays,
  });
  const normalizedProfitVelocity = normalizeWithKnots(
    metrics.profitVelocity30,
    input.formula.normalizationKnots.profitVelocity,
  );
  const normalizedContributionMargin = metrics.contributionMargin === null
    ? null
    : normalizeWithKnots(metrics.contributionMargin, input.formula.normalizationKnots.contributionMargin);
  const normalizedLossRecurrence = normalizeWithKnots(
    metrics.lossRecurrence,
    input.formula.normalizationKnots.lossRecurrence,
  );
  const reliability = calculateReliability({
    paidOrderCount: input.paidOrderCount,
    observationDays: input.observationDays,
    orderShrinkK: input.formula.orderShrinkK,
    dayShrinkK: input.formula.dayShrinkK,
  });
  if (normalizedContributionMargin === null) {
    return {
      metrics,
      normalizedProfitVelocity,
      normalizedContributionMargin,
      normalizedLossRecurrence,
      rawScore: null,
      reliability,
      adjustedScore: null,
    };
  }
  const rawScore = input.formula.weights.profit * normalizedProfitVelocity
    + input.formula.weights.margin * normalizedContributionMargin
    + input.formula.weights.persistence * (100 - normalizedLossRecurrence);
  return {
    metrics,
    normalizedProfitVelocity,
    normalizedContributionMargin,
    normalizedLossRecurrence,
    rawScore,
    reliability,
    adjustedScore: 50 + reliability * (rawScore - 50),
  };
}

export function calculateReliability(input: {
  paidOrderCount: number;
  observationDays: number;
  orderShrinkK: number;
  dayShrinkK: number;
}): number {
  assertFinitePositive(input.orderShrinkK, 'orderShrinkK');
  assertFinitePositive(input.dayShrinkK, 'dayShrinkK');
  if (!Number.isFinite(input.paidOrderCount) || input.paidOrderCount < 0
    || !Number.isFinite(input.observationDays) || input.observationDays < 0) {
    throw new Error('Reliability evidence must be non-negative and finite');
  }
  const orderReliability = input.paidOrderCount / (input.paidOrderCount + input.orderShrinkK);
  const dayReliability = input.observationDays / (input.observationDays + input.dayShrinkK);
  const reliability = Math.sqrt(orderReliability * dayReliability);
  if (!Number.isFinite(reliability) || reliability < 0 || reliability >= 1) {
    throw new Error('Reliability must be finite and in [0, 1)');
  }
  return reliability;
}

export function normalizeWithKnots(value: number, knots: readonly NormalizationKnot[]): number {
  if (!Number.isFinite(value)) throw new Error('Normalization value must be finite');
  const normalized = normalizeKnots(knots);
  if (value <= normalized[0]!.value) return normalized[0]!.score;
  if (value >= normalized[normalized.length - 1]!.value) return normalized[normalized.length - 1]!.score;
  for (let index = 1; index < normalized.length; index += 1) {
    const right = normalized[index]!;
    const left = normalized[index - 1]!;
    if (value <= right.value) {
      return left.score + (value - left.value) * (right.score - left.score) / (right.value - left.value);
    }
  }
  throw new Error('Normalization knots are invalid');
}

export function buildQuantileKnots(values: readonly number[]): NormalizationKnot[] {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('Quantile values must be a non-empty finite collection');
  }
  const probabilities = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
  const sorted = [...values].sort((left, right) => left - right);
  const provisional = probabilities.map((probability) => ({
    value: quantile(sorted, probability),
    score: probability * 100,
  }));
  return normalizeKnots(provisional);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256CanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function epochDay(date: Date): number {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error('Date must be valid');
  }
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MILLISECONDS_PER_DAY);
}

function validateFormulaParameters(formula: ProfitabilityFormulaParameters): void {
  if (!Number.isInteger(formula.halfLifeDays) || formula.halfLifeDays < 30 || formula.halfLifeDays > 365) {
    throw new Error('halfLifeDays must be an integer in [30, 365]');
  }
  const weights = formula.weights;
  if (![weights.profit, weights.margin, weights.persistence].every(Number.isFinite)
    || Math.abs(weights.profit + weights.margin + weights.persistence - 1) > 1e-9
    || weights.profit < weights.margin || weights.profit < weights.persistence
    || Object.values(weights).some((weight) => weight < 0)) {
    throw new Error('Formula weights are invalid');
  }
  assertFinitePositive(formula.orderShrinkK, 'orderShrinkK');
  assertFinitePositive(formula.dayShrinkK, 'dayShrinkK');
  normalizeKnots(formula.normalizationKnots.profitVelocity);
  normalizeKnots(formula.normalizationKnots.contributionMargin);
  normalizeKnots(formula.normalizationKnots.lossRecurrence);
}

function assertContributionFact(fact: ProfitabilityContributionFact): void {
  if (!Number.isInteger(fact.coveredDays) || fact.coveredDays <= 0) {
    throw new Error('coveredDays must be a positive integer');
  }
  if (epochDay(fact.coverageEndDate) < epochDay(fact.coverageStartDate)) {
    throw new Error('Contribution fact coverage end precedes its start');
  }
  if (fact.coveredDays !== epochDay(fact.coverageEndDate) - epochDay(fact.coverageStartDate) + 1) {
    throw new Error('coveredDays must equal the inclusive calendar coverage');
  }
  for (const [name, value] of Object.entries({
    revenue: fact.revenue,
    orderTimeCogs: fact.orderTimeCogs,
    adSpend: fact.adSpend,
    contributionProfit: fact.contributionProfit,
    negativeCoveredDays: fact.negativeCoveredDays,
  })) {
    if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
  }
  if (fact.revenue < 0 || fact.orderTimeCogs < 0 || fact.adSpend < 0
    || fact.negativeCoveredDays < 0 || fact.negativeCoveredDays > fact.coveredDays) {
    throw new Error('Contribution fact amounts are outside their valid bounds');
  }
}

function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive and finite`);
}

function normalizeKnots(knots: readonly NormalizationKnot[]): NormalizationKnot[] {
  if (knots.length === 0) throw new Error('At least one normalization knot is required');
  const sorted = [...knots].map((knot) => ({ ...knot })).sort((left, right) =>
    left.value - right.value || left.score - right.score);
  const merged: NormalizationKnot[] = [];
  for (const knot of sorted) {
    if (!Number.isFinite(knot.value) || !Number.isFinite(knot.score) || knot.score < 0 || knot.score > 100) {
      throw new Error('Normalization knots must be finite scores in [0, 100]');
    }
    const prior = merged[merged.length - 1];
    if (prior && prior.value === knot.value) {
      const sameValue = sorted.filter((candidate) => candidate.value === knot.value);
      merged[merged.length - 1] = {
        value: prior.value,
        score: sameValue.reduce((sum, candidate) => sum + candidate.score, 0) / sameValue.length,
      };
    } else {
      merged.push({ ...knot });
    }
  }
  return merged;
}

function quantile(sorted: readonly number[], probability: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (position - lower) * (sorted[upper]! - sorted[lower]!);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}
