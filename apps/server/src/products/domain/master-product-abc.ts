import type {
  ProductAbcCalculationStatus,
  ProductAbcCostBreakdown,
  ProductAbcCostComponent,
  ProductAbcEvaluation,
  ProductAbcFormulaSummary,
  ProductAbcSourceFreshness,
} from '@kiditem/shared/product-abc';
import type { MasterProductProfitabilityEvidence } from '../../finance/application/port/in/master-product-profitability-read.port';
import {
  calculateProfitabilityScore,
  type ProfitabilityContributionFact,
  type ProfitabilityFormulaParameters,
} from './master-product-profitability-score';

export type MasterProductAbcEvaluationInput = Readonly<{
  evidence: MasterProductProfitabilityEvidence;
  formula: ProductAbcFormulaSummary | null;
  calculatedAt: Date;
  recalculating?: boolean;
  previousNormalEvaluation?: ProductAbcEvaluation | null;
}>;

/**
 * Products owns the grade decision. Finance supplies evidence only. This
 * function calculates one product's ready score; the service assigns the
 * fixed A/B/C quantiles across the current active positive-profit cohort.
 * Finance keeps unavailable advertising provenance while supplying its
 * calculation-only 0 KRW treatment.
 */
export function evaluateMasterProductAbc(
  input: MasterProductAbcEvaluationInput,
): ProductAbcEvaluation {
  const { evidence } = input;
  const sourceFreshness = sourceFreshnessFor(evidence);
  const costBreakdown = aggregateCostBreakdown(evidence);
  const base = {
    paidOrderCount: evidence.paidOrderCount,
    observationDays: evidence.observationDays,
    firstValidPaidSaleAt: evidence.firstValidPaidSaleAt,
    sourceFreshness,
    costBreakdown,
    calculatedAt: input.calculatedAt,
  } as const;

  if (evidence.sellpiaStatus === 'UNMAPPED'
    || evidence.mappingStatus === 'UNMAPPED'
    || evidence.mappingStatus === 'AMBIGUOUS'
    || evidence.mappingStatus === 'STALE') {
    return unavailableEvaluation(base, 'SOURCE_UNMAPPED', '셀피아 상품·옵션 매핑이 확인되지 않았습니다.');
  }
  if (evidence.sellpiaStatus !== 'READY') {
    return retainOrUnavailable({
      base,
      status: 'SELLPIA_SOURCE_STALE',
      detail: '셀피아 상품별 이익현황 원천이 최신 전체 범위를 충족하지 않습니다.',
      previous: input.previousNormalEvaluation,
    });
  }
  if (!input.formula) {
    return unavailableEvaluation(base, 'CALIBRATION_PENDING', '검증된 ABC 수식 버전이 아직 없습니다.');
  }
  if (input.recalculating) {
    return retainOrUnavailable({
      base,
      status: 'RECALCULATING',
      detail: '새 수식 버전으로 재계산 중입니다.',
      previous: input.previousNormalEvaluation,
      fallbackFormula: input.formula,
    });
  }

  try {
    const facts = scoreFacts(evidence);
    const score = calculateProfitabilityScore({
      facts,
      asOfDate: evidence.asOfDate,
      formula: formulaParameters(input.formula),
      observationDays: evidence.observationDays,
    });
    if (
      score.metrics.weightedContributionProfit <= 0
      || score.adjustedScore === null
      || score.rawScore === null
      || score.normalizedContributionMargin === null
    ) {
      return readyEvaluation({
        base,
        formula: input.formula,
        grade: 'C',
        score,
      });
    }
    return readyEvaluation({
      base,
      formula: input.formula,
      grade: score.adjustedScore >= input.formula.cutoffs.bToA
        ? 'A'
        : score.adjustedScore >= input.formula.cutoffs.cToB ? 'B' : 'C',
      score,
    });
  } catch (error) {
    return retainOrUnavailable({
      base,
      status: 'CALCULATION_ERROR',
      detail: error instanceof Error ? `ABC 계산 오류: ${error.message}` : 'ABC 계산 중 알 수 없는 오류가 발생했습니다.',
      previous: input.previousNormalEvaluation,
      fallbackFormula: input.formula,
    });
  }
}

const ABC_QUANTILE_POLICY = {
  aTopShare: 0.2,
  bTopShare: 0.7,
} as const;

/**
 * Assigns the fixed operating distribution after every product has an
 * independently calculated score. Equal scores at a boundary stay together,
 * so input order cannot split equivalent products across grades.
 */
export function applyMasterProductAbcQuantiles(
  evaluations: ReadonlyMap<string, ProductAbcEvaluation>,
): ReadonlyMap<string, ProductAbcEvaluation> {
  const ranked = [...evaluations.entries()]
    .filter(([, evaluation]) => (
      evaluation.calculationStatus === 'READY'
      && evaluation.adjustedScore !== null
      && (evaluation.weightedContributionProfit ?? 0) > 0
    ))
    .sort(([leftId, left], [rightId, right]) => (
      right.adjustedScore! - left.adjustedScore! || leftId.localeCompare(rightId)
    ));
  const aCutoff = scoreAtShare(ranked, ABC_QUANTILE_POLICY.aTopShare);
  const bCutoff = scoreAtShare(ranked, ABC_QUANTILE_POLICY.bTopShare);

  return new Map([...evaluations.entries()].map(([masterProductId, evaluation]) => {
    if (evaluation.calculationStatus !== 'READY') return [masterProductId, evaluation] as const;
    if ((evaluation.weightedContributionProfit ?? 0) <= 0 || evaluation.adjustedScore === null) {
      return [masterProductId, { ...evaluation, abcGrade: 'C' }] as const;
    }
    const abcGrade = aCutoff !== null && evaluation.adjustedScore >= aCutoff
      ? 'A'
      : bCutoff !== null && evaluation.adjustedScore >= bCutoff ? 'B' : 'C';
    return [masterProductId, { ...evaluation, abcGrade }] as const;
  }));
}

function scoreAtShare(
  ranked: readonly (readonly [string, ProductAbcEvaluation])[],
  topShare: number,
): number | null {
  if (ranked.length === 0) return null;
  const index = Math.min(ranked.length - 1, Math.max(0, Math.ceil(ranked.length * topShare) - 1));
  return ranked[index]![1].adjustedScore;
}

function readyEvaluation(input: {
  base: EvaluationBase;
  formula: ProductAbcFormulaSummary;
  grade: 'A' | 'B' | 'C';
  score: ReturnType<typeof calculateProfitabilityScore>;
}): ProductAbcEvaluation {
  const metrics = input.score.metrics;
  return {
    abcGrade: input.grade,
    calculationStatus: 'READY',
    // Zero revenue cannot produce a margin ratio. It is nevertheless a
    // deterministic hard-C outcome when its weighted contribution is
    // non-positive, so persist a bounded score instead of an invalid READY row.
    rawScore: input.score.rawScore ?? 0,
    adjustedScore: input.score.adjustedScore ?? 0,
    reliability: input.score.reliability,
    weightedRevenue: metrics.weightedRevenue,
    weightedOrderTimeCogs: metrics.weightedOrderTimeCogs,
    weightedAdSpend: metrics.weightedAdSpend,
    weightedContributionProfit: metrics.weightedContributionProfit,
    profitVelocity30: metrics.profitVelocity30,
    weightedContributionMargin: metrics.contributionMargin,
    lossRecurrence: metrics.lossRecurrence,
    formula: input.formula,
    statusDetail: null,
    ...input.base,
  };
}

type EvaluationBase = Readonly<{
  paidOrderCount: number;
  observationDays: number;
  firstValidPaidSaleAt: Date | null;
  sourceFreshness: ProductAbcSourceFreshness;
  costBreakdown: ProductAbcCostBreakdown;
  calculatedAt: Date;
}>;

function unavailableEvaluation(
  base: EvaluationBase,
  calculationStatus: Extract<
    ProductAbcCalculationStatus,
    'SOURCE_UNMAPPED' | 'CALIBRATION_PENDING'
  >,
  statusDetail: string,
): ProductAbcEvaluation {
  return {
    abcGrade: null,
    calculationStatus,
    rawScore: null,
    adjustedScore: null,
    reliability: null,
    weightedRevenue: null,
    weightedOrderTimeCogs: null,
    weightedAdSpend: null,
    weightedContributionProfit: null,
    profitVelocity30: null,
    weightedContributionMargin: null,
    lossRecurrence: null,
    formula: null,
    statusDetail,
    ...base,
  };
}

function retainOrUnavailable(input: {
  base: EvaluationBase;
  status: Extract<
    ProductAbcCalculationStatus,
    'RECALCULATING' | 'SELLPIA_SOURCE_STALE' | 'AD_SOURCE_STALE' | 'CALCULATION_ERROR'
  >;
  detail: string;
  previous: ProductAbcEvaluation | null | undefined;
  fallbackFormula?: ProductAbcFormulaSummary | null;
}): ProductAbcEvaluation {
  const prior = input.previous;
  if (prior?.calculationStatus === 'READY' && prior.abcGrade !== null) {
    return {
      ...prior,
      calculationStatus: input.status,
      formula: prior.formula ?? input.fallbackFormula ?? null,
      sourceFreshness: input.base.sourceFreshness,
      costBreakdown: input.base.costBreakdown,
      paidOrderCount: input.base.paidOrderCount,
      observationDays: input.base.observationDays,
      firstValidPaidSaleAt: input.base.firstValidPaidSaleAt,
      calculatedAt: input.base.calculatedAt,
      statusDetail: input.detail,
    };
  }
  return {
    abcGrade: null,
    calculationStatus: input.status,
    rawScore: null,
    adjustedScore: null,
    reliability: null,
    weightedRevenue: null,
    weightedOrderTimeCogs: null,
    weightedAdSpend: null,
    weightedContributionProfit: null,
    profitVelocity30: null,
    weightedContributionMargin: null,
    lossRecurrence: null,
    formula: input.fallbackFormula ?? null,
    statusDetail: input.detail,
    ...input.base,
  };
}

function formulaParameters(formula: ProductAbcFormulaSummary): ProfitabilityFormulaParameters {
  return {
    halfLifeDays: formula.halfLifeDays,
    weights: formula.weights,
    dayShrinkK: formula.dayShrinkK,
    normalizationKnots: formula.normalizationKnots,
  };
}

function scoreFacts(evidence: MasterProductProfitabilityEvidence): ProfitabilityContributionFact[] {
  if (evidence.monthlyFacts.length === 0) throw new Error('수익성 월별 증거가 없습니다');
  return evidence.monthlyFacts.map((fact) => {
    if (fact.contributionProfit === null || fact.adSpend === null || fact.negativeCoveredDays === null) {
      throw new Error(`${fact.yearMonth} 월의 비용 증거가 완전하지 않습니다`);
    }
    return {
      coverageStartDate: fact.coverageStartDate,
      coverageEndDate: fact.coverageEndDate,
      coveredDays: fact.coveredDays,
      revenue: fact.revenue,
      orderTimeCogs: fact.sellpiaInAmount,
      adSpend: fact.adSpend,
      contributionProfit: fact.contributionProfit,
      negativeCoveredDays: fact.negativeCoveredDays,
    };
  });
}

function sourceFreshnessFor(evidence: MasterProductProfitabilityEvidence): ProductAbcSourceFreshness {
  const coverageStartDate = minCalendarDate(evidence.monthlyFacts.map((fact) => fact.coverageStartDate));
  const coverageEndDate = maxCalendarDate(evidence.monthlyFacts.map((fact) => fact.coverageEndDate));
  return {
    evaluationCutoffDate: calendarDate(evidence.asOfDate),
    sellpia: {
      status: evidence.sellpiaStatus,
      coverageStartDate,
      coverageEndDate,
      capturedAt: evidence.sellpiaCapturedAt,
    },
    advertising: {
      status: evidence.adStatus,
      coverageStartDate: evidence.advertisingCoverageStartDate
        ? calendarDate(evidence.advertisingCoverageStartDate)
        : null,
      coverageEndDate: evidence.advertisingCoverageEndDate
        ? calendarDate(evidence.advertisingCoverageEndDate)
        : null,
      capturedAt: evidence.advertisingCapturedAt,
    },
    orders: {
      status: evidence.ordersStatus,
      coverageStartDate: evidence.ordersCoverageStartDate
        ? calendarDate(evidence.ordersCoverageStartDate)
        : null,
      coverageEndDate: evidence.ordersCoverageEndDate
        ? calendarDate(evidence.ordersCoverageEndDate)
        : null,
      capturedAt: evidence.ordersCapturedAt ?? null,
    },
    mapping: {
      status: evidence.mappingStatus,
      inventoryGeneration: evidence.mappingInventoryGeneration,
      verifiedAt: evidence.mappingVerifiedAt,
    },
  };
}

function aggregateCostBreakdown(evidence: MasterProductProfitabilityEvidence): ProductAbcCostBreakdown {
  const facts = evidence.monthlyFacts;
  return {
    recognizedRevenue: aggregateComponents(facts.map((fact) => fact.costBreakdown.recognizedRevenue)),
    orderTimeCogs: aggregateComponents(facts.map((fact) => fact.costBreakdown.orderTimeCogs)),
    advertisingSpend: aggregateComponents(facts.map((fact) => fact.costBreakdown.advertisingSpend)),
    marketplaceCommission: aggregateComponents(facts.map((fact) => fact.costBreakdown.marketplaceCommission)),
    outboundFulfillment: aggregateComponents(facts.map((fact) => fact.costBreakdown.outboundFulfillment)),
    returnLoss: aggregateComponents(facts.map((fact) => fact.costBreakdown.returnLoss)),
    otherVariableCost: aggregateComponents(facts.map((fact) => fact.costBreakdown.otherVariableCost)),
  };
}

function aggregateComponents(components: readonly ProductAbcCostComponent[]): ProductAbcCostComponent {
  const amount = components.reduce((sum, component) => sum + (component.amount ?? 0), 0);
  const unavailableAmount = components.length > 0
    && components.every((component) => component.amount === 0)
    ? 0
    : null;
  if (components.some((component) => component.status === 'STALE')) {
    return { amount: unavailableAmount, status: 'STALE' };
  }
  if (components.length === 0 || components.some((component) => component.status === 'MISSING')) {
    return { amount: unavailableAmount, status: 'MISSING' };
  }
  if (components.some((component) => component.status === 'OBSERVED')) return { amount, status: 'OBSERVED' };
  if (components.some((component) => component.status === 'CONFIRMED_ZERO')) return { amount, status: 'CONFIRMED_ZERO' };
  return { amount, status: 'NOT_APPLIED' };
}

function minCalendarDate(dates: readonly Date[]): string | null {
  if (dates.length === 0) return null;
  return calendarDate(new Date(Math.min(...dates.map((date) => date.getTime()))));
}

function maxCalendarDate(dates: readonly Date[]): string | null {
  if (dates.length === 0) return null;
  return calendarDate(new Date(Math.max(...dates.map((date) => date.getTime()))));
}

function calendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
