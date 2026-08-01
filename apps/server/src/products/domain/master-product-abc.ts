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
 * Products owns the grade decision. Finance supplies evidence only; this
 * function never changes a formula, derives a portfolio rank, or invents a
 * cost for an unavailable source.
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

  if (evidence.sellpiaStatus === 'UNMAPPED') {
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
  if (evidence.adStatus !== 'READY' && evidence.adStatus !== 'CONFIRMED_ZERO') {
    return retainOrUnavailable({
      base,
      status: 'AD_SOURCE_STALE',
      detail: '광고비 원천이 최신 전체 범위를 충족하지 않습니다.',
      previous: input.previousNormalEvaluation,
    });
  }
  if (!evidence.eligibilityReached) {
    return unavailableEvaluation(
      base,
      'INSUFFICIENT_EVIDENCE',
      '최초 유효 유료 판매 후 30일 또는 유효 유료 주문 20건이 필요합니다.',
    );
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
      paidOrderCount: evidence.paidOrderCount,
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
    'INSUFFICIENT_EVIDENCE' | 'SOURCE_UNMAPPED' | 'CALIBRATION_PENDING'
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
    orderShrinkK: formula.orderShrinkK,
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
      coverageStartDate,
      coverageEndDate,
      capturedAt: evidence.advertisingCapturedAt,
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
  if (components.some((component) => component.status === 'STALE')) return { amount: null, status: 'STALE' };
  if (components.length === 0 || components.some((component) => component.status === 'MISSING')) {
    return { amount: null, status: 'MISSING' };
  }
  const amount = components.reduce((sum, component) => sum + (component.amount ?? 0), 0);
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
