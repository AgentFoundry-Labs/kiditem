import {
  PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD,
  type ProductAbcFormulaPayload,
} from '@kiditem/shared/product-abc';

/**
 * A source-owned, already eligible set of facts for one product.
 *
 * The calculation boundary deliberately contains no source freshness or
 * publication state. Those decisions belong to the caller that assembles this
 * value. Every monthly row still carries the provenance needed to prove that
 * the amounts are safe for the fixed formula.
 */
export type MasterProductAbcFormulaReadyMonthlyFact = Readonly<{
  yearMonth: string;
  coverageStartDate: Date | string;
  coverageEndDate: Date | string;
  coveredDays: number;
  recognizedRevenue: number;
  orderTimeSupplyCost: number;
  advertisingSpend: number | null;
  provenance: Readonly<{
    costBasis: 'ORDER_TIME_SUPPLY_COST';
    vatIncluded: true;
    advertisingEvidence: 'OBSERVED' | 'CONFIRMED_ZERO' | 'NOT_APPLIED';
  }>;
}>;

export type MasterProductAbcFormulaReadyFacts = Readonly<{
  masterProductId: string;
  /** The final day of the latest complete KST month in the source snapshot. */
  cutoffDate: Date | string;
  monthlyFacts: readonly MasterProductAbcFormulaReadyMonthlyFact[];
}>;

export type MasterProductAbcCandidateInput = Readonly<{
  facts: MasterProductAbcFormulaReadyFacts;
  formula: ProductAbcFormulaPayload;
}>;

export type MasterProductAbcCandidate = Readonly<{
  masterProductId: string;
  abcGrade: 'A' | 'B' | 'C';
  validObservationDays: number;
  gradeBasisCutoffDate: string;
  weightedRevenue: number;
  weightedOrderTimeSupplyCost: number;
  weightedAdvertisingSpend: number;
  weightedOperatingProfit: number;
  operatingProfitVelocity30: number;
  operatingMargin: number | null;
  lossPersistence: number;
  profitScore: number;
  marginScore: number | null;
  consistencyScore: number;
  economicScore: number;
}>;

export type MasterProductAbcAnchor = Readonly<{
  value: number;
  score: number;
}>;

/**
 * The canonical payload is shared by source readers and Products. Exporting
 * this reference keeps fixtures and callers on the same immutable definition;
 * the evaluator never maintains a second copy of its literals.
 */
export { PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD };

/**
 * Evaluate exactly one product from formula-ready monthly facts.
 *
 * This is intentionally a pure function. It does not assign any portfolio
 * context or perform persistence. A malformed source row is an exception:
 * callers must not turn a contract failure into a grade.
 */
export function evaluateMasterProductAbc(
  input: MasterProductAbcCandidateInput,
): MasterProductAbcCandidate {
  const formula = input.formula;
  const formulaReadyFacts = input.facts;
  const facts = selectFacts(formulaReadyFacts, formula);
  const metrics = calculateMetrics(facts, formulaReadyFacts.cutoffDate, formula);

  const profitScore = interpolateMasterProductAbcAnchor(
    metrics.operatingProfitVelocity30,
    formula.anchors.profitVelocity30,
  );
  const marginScore = metrics.operatingMargin === null
    ? null
    : interpolateMasterProductAbcAnchor(metrics.operatingMargin, formula.anchors.operatingMargin);
  // The persistence anchors are already a decreasing score table. There is
  // no second inversion here.
  const consistencyScore = interpolateMasterProductAbcAnchor(
    metrics.lossPersistence,
    formula.anchors.lossPersistence,
  );

  if (
    metrics.operatingMargin === null
    && metrics.weightedOperatingProfit > formula.hardC.weightedOperatingProfitLte
  ) {
    throw new Error('positive operating profit with zero revenue');
  }

  const economicScore = profitScore * formula.weights.profit
    + (marginScore ?? 0) * formula.weights.margin
    + consistencyScore * formula.weights.consistency;
  const hardC = metrics.weightedOperatingProfit
      <= formula.hardC.weightedOperatingProfitLte
    || (metrics.operatingMargin !== null
      && metrics.operatingMargin <= formula.hardC.operatingMarginLte)
    || metrics.lossPersistence >= formula.hardC.lossPersistenceGte;

  const abcGrade = hardC
    ? 'C'
    : economicScore >= formula.gradeThresholds.aEconomicScoreGte
      && marginScore !== null
      && marginScore >= formula.gradeThresholds.aMarginScoreGte
      && consistencyScore >= formula.gradeThresholds.aConsistencyScoreGte
      ? 'A'
      : economicScore >= formula.gradeThresholds.bEconomicScoreGte
        ? 'B'
        : 'C';

  return {
    masterProductId: formulaReadyFacts.masterProductId,
    abcGrade,
    validObservationDays: metrics.validObservationDays,
    gradeBasisCutoffDate: calendarDate(formulaReadyFacts.cutoffDate),
    weightedRevenue: roundPersisted(metrics.weightedRevenue, formula),
    weightedOrderTimeSupplyCost: roundPersisted(metrics.weightedOrderTimeSupplyCost, formula),
    weightedAdvertisingSpend: roundPersisted(metrics.weightedAdvertisingSpend, formula),
    weightedOperatingProfit: roundPersisted(metrics.weightedOperatingProfit, formula),
    operatingProfitVelocity30: roundPersisted(metrics.operatingProfitVelocity30, formula),
    operatingMargin: roundPersisted(metrics.operatingMargin, formula),
    lossPersistence: roundPersisted(metrics.lossPersistence, formula),
    profitScore: roundPersisted(profitScore, formula),
    marginScore: roundPersisted(marginScore, formula),
    consistencyScore: roundPersisted(consistencyScore, formula),
    economicScore: roundPersisted(economicScore, formula),
  };
}

type NormalizedFact = Readonly<{
  yearMonth: string;
  coverageStartDay: number;
  coverageEndDay: number;
  coverageMidpointDay: number;
  coveredDays: number;
  recognizedRevenue: number;
  orderTimeSupplyCost: number;
  advertisingSpend: number;
}>;

type Metrics = Readonly<{
  validObservationDays: number;
  weightedRevenue: number;
  weightedOrderTimeSupplyCost: number;
  weightedAdvertisingSpend: number;
  weightedOperatingProfit: number;
  operatingProfitVelocity30: number;
  operatingMargin: number | null;
  lossPersistence: number;
}>;

function selectFacts(
  input: MasterProductAbcFormulaReadyFacts,
  formula: ProductAbcFormulaPayload,
): readonly NormalizedFact[] {
  if (formula.excludeCurrentKstMonth !== true) {
    throw new Error('formula must exclude the current KST month');
  }
  if (!Number.isFinite(formula.halfLifeDays) || formula.halfLifeDays <= 0) {
    throw new Error('formula half-life is invalid');
  }
  if (!Number.isInteger(formula.maxCompleteMonths) || formula.maxCompleteMonths <= 0) {
    throw new Error('formula month window is invalid');
  }
  if (!input || typeof input.masterProductId !== 'string' || input.masterProductId.length === 0) {
    throw new Error('formula-ready product identity is required');
  }
  const cutoffDay = kstEpochDay(input.cutoffDate);
  const cutoffMonth = yearMonthForEpochDay(cutoffDay);
  if (cutoffDay !== kstEpochDay(`${cutoffMonth}-${String(daysInMonth(cutoffMonth)).padStart(2, '0')}`)) {
    throw new Error('cutoff must be the final day of a complete KST month');
  }
  const firstMonth = shiftYearMonth(
    cutoffMonth,
    -(formula.maxCompleteMonths - 1),
  );
  const rawFacts = input.monthlyFacts;
  if (!Array.isArray(rawFacts)) throw new Error('formula-ready monthly facts are required');

  const selected: NormalizedFact[] = [];
  const seenMonths = new Set<string>();
  for (const rawFact of rawFacts) {
    const month = validateYearMonth(rawFact.yearMonth);
    // Current and older-than-window rows are intentionally ignored before
    // validating their amounts. They are outside this calculation's basis.
    if (month > cutoffMonth || month < firstMonth) continue;
    if (seenMonths.has(month)) throw new Error(`duplicate monthly fact ${month}`);
    seenMonths.add(month);

    const coverageStartDay = kstEpochDay(rawFact.coverageStartDate);
    const coverageEndDay = kstEpochDay(rawFact.coverageEndDate);
    const monthStartDay = kstEpochDay(`${month}-01`);
    const monthEndDay = monthStartDay + daysInMonth(month) - 1;
    if (coverageStartDay > coverageEndDay) throw new Error(`invalid coverage ${month}`);
    if (coverageStartDay < monthStartDay || coverageEndDay > monthEndDay) {
      throw new Error(`coverage outside month ${month}`);
    }
    if (coverageEndDay > cutoffDay) throw new Error(`coverage after cutoff ${month}`);

    const coveredDays = rawFact.coveredDays;
    if (!finiteNumber(coveredDays) || !Number.isInteger(coveredDays) || coveredDays <= 0) {
      throw new Error(`invalid covered days ${month}`);
    }
    const spanDays = coverageEndDay - coverageStartDay + 1;
    if (coveredDays > spanDays) throw new Error(`covered days exceed coverage ${month}`);

    validateProvenance(rawFact.provenance, month);
    const recognizedRevenue = finiteAmount(rawFact.recognizedRevenue, `recognized revenue ${month}`);
    const orderTimeSupplyCost = finiteAmount(rawFact.orderTimeSupplyCost, `order-time supply cost ${month}`);
    const advertisingSpend = advertisingAmount(rawFact, month);

    selected.push({
      yearMonth: month,
      coverageStartDay,
      coverageEndDay,
      coverageMidpointDay: (coverageStartDay + coverageEndDay) / 2,
      coveredDays,
      recognizedRevenue,
      orderTimeSupplyCost,
      advertisingSpend,
    });
  }

  selected.sort((left, right) => left.yearMonth.localeCompare(right.yearMonth));
  const validObservationDays = selected.reduce((sum, fact) => sum + fact.coveredDays, 0);
  if (validObservationDays < formula.minimumObservationDays) {
    throw new Error('insufficient complete observation days');
  }
  return selected;
}

function calculateMetrics(
  facts: readonly NormalizedFact[],
  cutoffDate: Date | string,
  formula: ProductAbcFormulaPayload,
): Metrics {
  if (facts.length === 0) throw new Error('formula-ready monthly facts are empty');
  const finalDay = kstEpochDay(cutoffDate);
  let validObservationDays = 0;
  let weightedRevenue = 0;
  let weightedOrderTimeSupplyCost = 0;
  let weightedAdvertisingSpend = 0;
  let weightedOperatingProfit = 0;
  let weightedCoveredDays = 0;
  let weightedNegativeDays = 0;

  for (const fact of facts) {
    const ageDays = finalDay - fact.coverageMidpointDay;
    if (ageDays < 0) throw new Error(`coverage midpoint after cutoff ${fact.yearMonth}`);
    const weight = 2 ** (-ageDays / formula.halfLifeDays);
    const operatingProfit = fact.recognizedRevenue
      - fact.orderTimeSupplyCost
      - fact.advertisingSpend;
    const weightedDays = weight * fact.coveredDays;

    validObservationDays += fact.coveredDays;
    weightedCoveredDays += weightedDays;
    weightedNegativeDays += operatingProfit < 0 ? weightedDays : 0;
    weightedRevenue += weight * fact.recognizedRevenue;
    weightedOrderTimeSupplyCost += weight * fact.orderTimeSupplyCost;
    weightedAdvertisingSpend += weight * fact.advertisingSpend;
    weightedOperatingProfit += weight * operatingProfit;
  }

  if (!(weightedCoveredDays > 0) || !Number.isFinite(weightedCoveredDays)) {
    throw new Error('weighted observation days are invalid');
  }
  if (!Number.isFinite(weightedRevenue)
    || !Number.isFinite(weightedOrderTimeSupplyCost)
    || !Number.isFinite(weightedAdvertisingSpend)
    || !Number.isFinite(weightedOperatingProfit)) {
    throw new Error('weighted amounts are invalid');
  }
  if (facts.some((fact) => fact.recognizedRevenue < 0
    || fact.orderTimeSupplyCost < 0
    || fact.advertisingSpend < 0)) {
    if (weightedRevenue === 0 && weightedOperatingProfit > 0) {
      throw new Error('positive operating profit with zero revenue');
    }
    throw new Error('source amount is negative');
  }
  if (weightedRevenue === 0 && weightedOperatingProfit > 0) {
    throw new Error('positive operating profit with zero revenue');
  }
  const operatingMargin = weightedRevenue === 0
    ? null
    : weightedOperatingProfit / weightedRevenue;
  if (operatingMargin !== null && !Number.isFinite(operatingMargin)) {
    throw new Error('operating margin is invalid');
  }
  return {
    validObservationDays,
    weightedRevenue,
    weightedOrderTimeSupplyCost,
    weightedAdvertisingSpend,
    weightedOperatingProfit,
    operatingProfitVelocity30: weightedOperatingProfit / weightedCoveredDays * formula.velocityPeriodDays,
    operatingMargin,
    lossPersistence: weightedNegativeDays / weightedCoveredDays,
  };
}

function validateProvenance(
  provenance: MasterProductAbcFormulaReadyMonthlyFact['provenance'],
  month: string,
): void {
  if (!provenance || provenance.costBasis !== 'ORDER_TIME_SUPPLY_COST') {
    throw new Error(`ineligible cost provenance ${month}`);
  }
  if (provenance.vatIncluded !== true) {
    throw new Error(`VAT inclusion is not verified ${month}`);
  }
  if (
    provenance.advertisingEvidence !== 'OBSERVED'
    && provenance.advertisingEvidence !== 'CONFIRMED_ZERO'
    && provenance.advertisingEvidence !== 'NOT_APPLIED'
  ) {
    throw new Error(`ineligible advertising evidence ${month}`);
  }
}

function advertisingAmount(
  fact: MasterProductAbcFormulaReadyMonthlyFact,
  month: string,
): number {
  const amount = fact.advertisingSpend;
  switch (fact.provenance.advertisingEvidence) {
    case 'NOT_APPLIED':
      if (amount !== null && amount !== 0) throw new Error(`advertising amount is not applied ${month}`);
      return 0;
    case 'CONFIRMED_ZERO':
      if (amount !== 0) throw new Error(`confirmed-zero advertising must be literal zero ${month}`);
      return 0;
    case 'OBSERVED':
      return finiteAmount(amount, `advertising spend ${month}`);
  }
}

export function interpolateMasterProductAbcAnchor(
  value: number,
  anchors: readonly MasterProductAbcAnchor[],
): number {
  if (!Number.isFinite(value) || anchors.length < 2) throw new Error('invalid anchor input');
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index]!;
    if (!Number.isFinite(anchor.value) || !Number.isFinite(anchor.score)) {
      throw new Error('invalid anchor');
    }
    if (index > 0 && anchor.value <= anchors[index - 1]!.value) {
      throw new Error('anchors must be strictly increasing');
    }
    if (value === anchor.value) return anchor.score;
  }
  if (value <= anchors[0]!.value) return anchors[0]!.score;
  for (let index = 1; index < anchors.length; index += 1) {
    const upper = anchors[index]!;
    const lower = anchors[index - 1]!;
    if (value <= upper.value) {
      return lower.score + (value - lower.value)
        * (upper.score - lower.score) / (upper.value - lower.value);
    }
  }
  return anchors[anchors.length - 1]!.score;
}

function roundPersisted(value: number | null, formula: ProductAbcFormulaPayload): number | null {
  if (value === null) return null;
  const scale = formula.precision.persistedScale;
  const factor = 10 ** scale;
  const scaled = value * factor;
  const rounded = scaled < 0 ? Math.ceil(scaled - 0.5) : Math.floor(scaled + 0.5);
  const result = rounded / factor;
  return Object.is(result, -0) ? 0 : result;
}

function finiteAmount(value: unknown, label: string): number {
  if (!finiteNumber(value)) throw new Error(`${label} is invalid`);
  return value;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateYearMonth(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error(`invalid year-month ${String(value)}`);
  }
  return value;
}

function calendarDate(value: Date | string): string {
  const day = kstEpochDay(value);
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

function kstEpochDay(value: Date | string): number {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = Date.UTC(year!, month! - 1, day);
    const date = new Date(parsed);
    if (
      !Number.isFinite(parsed)
      || date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month! - 1
      || date.getUTCDate() !== day
    ) throw new Error(`invalid calendar date ${value}`);
    return Math.floor(parsed / 86_400_000);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid calendar date ${String(value)}`);
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return Math.floor(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(),
  ) / 86_400_000);
}

function yearMonthForEpochDay(epochDay: number): string {
  return new Date(epochDay * 86_400_000).toISOString().slice(0, 7);
}

function shiftYearMonth(yearMonth: string, amount: number): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(year!, month!, 0)).getUTCDate();
}
