import { z } from 'zod';
import { zIsoDate } from './common.js';

const CalendarDateSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
const FiniteNumberSchema = z.number().finite();
const ChecksumSchema = z.string().regex(/^[a-f0-9]{64}$/i);

export const ProductAbcGradeSchema = z.enum(['A', 'B', 'C']);
export type ProductAbcGrade = z.infer<typeof ProductAbcGradeSchema>;

export const ProductAbcCalculationStatusSchema = z.enum([
  'READY',
  'INSUFFICIENT_EVIDENCE',
  'SOURCE_UNMAPPED',
  'CALIBRATION_PENDING',
  'RECALCULATING',
  'SELLPIA_SOURCE_STALE',
  'AD_SOURCE_STALE',
  'CALCULATION_ERROR',
]);
export type ProductAbcCalculationStatus = z.infer<
  typeof ProductAbcCalculationStatusSchema
>;

export const ProductAbcCostStatusSchema = z.enum([
  'OBSERVED',
  'CONFIRMED_ZERO',
  'NOT_APPLIED',
  'STALE',
  'MISSING',
]);
export type ProductAbcCostStatus = z.infer<typeof ProductAbcCostStatusSchema>;

export const ProductAbcSellpiaSourceStatusSchema = z.enum([
  'READY',
  'STALE',
  'UNMAPPED',
  'MISSING',
]);
export type ProductAbcSellpiaSourceStatus = z.infer<
  typeof ProductAbcSellpiaSourceStatusSchema
>;

export const ProductAbcAdvertisingSourceStatusSchema = z.enum([
  'READY',
  'CONFIRMED_ZERO',
  'STALE',
  'MISSING',
]);
export type ProductAbcAdvertisingSourceStatus = z.infer<
  typeof ProductAbcAdvertisingSourceStatusSchema
>;

const ProductAbcObservedCostComponentSchema = z.object({
  amount: z.number().int().nonnegative(),
  status: z.enum(['OBSERVED', 'CONFIRMED_ZERO', 'NOT_APPLIED']),
}).strict();

const ProductAbcUnavailableCostComponentSchema = z.object({
  amount: z.null(),
  status: z.enum(['STALE', 'MISSING']),
}).strict();

export const ProductAbcCostComponentSchema = z.union([
  ProductAbcObservedCostComponentSchema,
  ProductAbcUnavailableCostComponentSchema,
]);
export type ProductAbcCostComponent = z.infer<
  typeof ProductAbcCostComponentSchema
>;

export const ProductAbcCostBreakdownSchema = z.object({
  recognizedRevenue: ProductAbcCostComponentSchema,
  orderTimeCogs: ProductAbcCostComponentSchema,
  advertisingSpend: ProductAbcCostComponentSchema,
  marketplaceCommission: ProductAbcCostComponentSchema,
  outboundFulfillment: ProductAbcCostComponentSchema,
  returnLoss: ProductAbcCostComponentSchema,
  otherVariableCost: ProductAbcCostComponentSchema,
}).strict();
export type ProductAbcCostBreakdown = z.infer<typeof ProductAbcCostBreakdownSchema>;

export const ProductAbcNormalizationKnotSchema = z.object({
  value: FiniteNumberSchema,
  score: FiniteNumberSchema.min(0).max(100),
}).strict();
export type ProductAbcNormalizationKnot = z.infer<
  typeof ProductAbcNormalizationKnotSchema
>;

const ProductAbcFormulaWeightsSchema = z.object({
  profit: FiniteNumberSchema.min(0).max(1),
  margin: FiniteNumberSchema.min(0).max(1),
  persistence: FiniteNumberSchema.min(0).max(1),
}).strict().superRefine((weights, context) => {
  if (Math.abs(weights.profit + weights.margin + weights.persistence - 1) > 1e-9) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['profit'],
      message: 'ABC formula weights must sum to one',
    });
  }
  if (weights.profit < weights.margin || weights.profit < weights.persistence) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['profit'],
      message: 'profit weight must be the largest ABC formula weight',
    });
  }
});

const ProductAbcFormulaCutoffsSchema = z.object({
  cToB: FiniteNumberSchema.min(0).max(100),
  bToA: FiniteNumberSchema.min(0).max(100),
}).strict().superRefine((cutoffs, context) => {
  if (cutoffs.cToB >= cutoffs.bToA) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bToA'],
      message: 'bToA must be greater than cToB',
    });
  }
});

const ProductAbcNormalizationKnotsSchema = z.object({
  profitVelocity: z.array(ProductAbcNormalizationKnotSchema).min(1).max(7),
  contributionMargin: z.array(ProductAbcNormalizationKnotSchema).min(1).max(7),
  lossRecurrence: z.array(ProductAbcNormalizationKnotSchema).min(1).max(7),
}).strict();

export const ProductAbcFormulaSummarySchema = z.object({
  formulaKey: z.literal('ABC_V1'),
  version: z.number().int().positive(),
  calculationCodeChecksum: ChecksumSchema,
  formulaChecksum: ChecksumSchema,
  activatedAt: zIsoDate,
  halfLifeDays: z.number().int().min(30).max(365),
  weights: ProductAbcFormulaWeightsSchema,
  orderShrinkK: FiniteNumberSchema.positive(),
  dayShrinkK: FiniteNumberSchema.positive(),
  cutoffs: ProductAbcFormulaCutoffsSchema,
  normalizationKnots: ProductAbcNormalizationKnotsSchema,
  trainingRange: z.object({
    from: CalendarDateSchema,
    to: CalendarDateSchema,
  }).strict(),
  sampleCount: z.number().int().nonnegative(),
  foldCount: z.number().int().nonnegative(),
  calibrationMetrics: z.object({
    meanSpearmanRankCorrelation: FiniteNumberSchema.min(-1).max(1),
    meanExplainedVariance: FiniteNumberSchema.min(0).max(1),
    gradeChurnRate: FiniteNumberSchema.min(0).max(1),
  }).strict(),
}).strict().superRefine((formula, context) => {
  if (formula.trainingRange.from > formula.trainingRange.to) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['trainingRange', 'to'],
      message: 'trainingRange.to must not precede trainingRange.from',
    });
  }
});
export type ProductAbcFormulaSummary = z.infer<
  typeof ProductAbcFormulaSummarySchema
>;

const ProductAbcSourceFreshnessItemSchema = z.object({
  status: z.enum(['READY', 'CONFIRMED_ZERO', 'STALE', 'UNMAPPED', 'MISSING']),
  coverageStartDate: CalendarDateSchema.nullable(),
  coverageEndDate: CalendarDateSchema.nullable(),
  capturedAt: zIsoDate.nullable(),
}).strict().superRefine((source, context) => {
  if ((source.coverageStartDate === null) !== (source.coverageEndDate === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['coverageEndDate'],
      message: 'source coverage bounds must both be present or absent',
    });
  }
  if (
    source.coverageStartDate
    && source.coverageEndDate
    && source.coverageStartDate > source.coverageEndDate
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['coverageEndDate'],
      message: 'source coverage end must not precede source coverage start',
    });
  }
});

export const ProductAbcSourceFreshnessSchema = z.object({
  evaluationCutoffDate: CalendarDateSchema,
  sellpia: ProductAbcSourceFreshnessItemSchema,
  advertising: ProductAbcSourceFreshnessItemSchema,
}).strict();
export type ProductAbcSourceFreshness = z.infer<
  typeof ProductAbcSourceFreshnessSchema
>;

const NullableMetricSchema = FiniteNumberSchema.nullable();

export const ProductAbcEvaluationSchema = z.object({
  abcGrade: ProductAbcGradeSchema.nullable(),
  calculationStatus: ProductAbcCalculationStatusSchema,
  rawScore: NullableMetricSchema,
  adjustedScore: NullableMetricSchema,
  reliability: FiniteNumberSchema.min(0).lt(1).nullable(),
  weightedRevenue: NullableMetricSchema,
  weightedOrderTimeCogs: NullableMetricSchema,
  weightedAdSpend: NullableMetricSchema,
  weightedContributionProfit: NullableMetricSchema,
  profitVelocity30: NullableMetricSchema,
  weightedContributionMargin: NullableMetricSchema,
  lossRecurrence: FiniteNumberSchema.min(0).max(1).nullable(),
  paidOrderCount: z.number().int().nonnegative(),
  observationDays: z.number().int().nonnegative(),
  firstValidPaidSaleAt: zIsoDate.nullable(),
  formula: ProductAbcFormulaSummarySchema.nullable(),
  sourceFreshness: ProductAbcSourceFreshnessSchema,
  costBreakdown: ProductAbcCostBreakdownSchema,
  statusDetail: z.string().trim().min(1).max(500).nullable(),
  calculatedAt: zIsoDate.nullable(),
}).strict().superRefine((evaluation, context) => {
  const gradeMustBeAbsent = new Set<ProductAbcCalculationStatus>([
    'INSUFFICIENT_EVIDENCE',
    'SOURCE_UNMAPPED',
    'CALIBRATION_PENDING',
  ]);
  if (gradeMustBeAbsent.has(evaluation.calculationStatus) && evaluation.abcGrade !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['abcGrade'],
      message: 'this calculation status cannot publish an ABC grade',
    });
  }
  if (evaluation.calculationStatus === 'READY') {
    if (evaluation.abcGrade === null || evaluation.formula === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['abcGrade'],
        message: 'READY evaluation requires a published grade and formula',
      });
    }
    if (
      evaluation.rawScore === null
      || evaluation.adjustedScore === null
      || evaluation.reliability === null
      || evaluation.weightedContributionProfit === null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rawScore'],
        message: 'READY evaluation requires calculated score and contribution metrics',
      });
    }
  }
});
export type ProductAbcEvaluation = z.infer<typeof ProductAbcEvaluationSchema>;

export const ProductAbcGradeHistorySchema = z.object({
  oldGrade: ProductAbcGradeSchema.nullable(),
  newGrade: ProductAbcGradeSchema.nullable(),
  calculationStatus: ProductAbcCalculationStatusSchema,
  formulaKey: z.literal('ABC_V1'),
  formulaVersion: z.number().int().positive(),
  formulaChecksum: ChecksumSchema,
  adjustedScore: NullableMetricSchema,
  weightedContributionProfit: NullableMetricSchema,
  weightedContributionMargin: NullableMetricSchema,
  sourceCutoffDate: CalendarDateSchema,
  reason: z.string().trim().min(1).max(100),
  calculatedAt: zIsoDate,
}).strict();
export type ProductAbcGradeHistory = z.infer<typeof ProductAbcGradeHistorySchema>;

export const ProductAbcGradeResultSchema = z.object({
  masterProductId: z.string().uuid(),
  abcGrade: ProductAbcGradeSchema.nullable(),
  evaluation: ProductAbcEvaluationSchema.nullable(),
}).strict();
export type ProductAbcGradeResult = z.infer<typeof ProductAbcGradeResultSchema>;

export const ProductAbcRecalculationResultSchema = z.object({
  changedProductCount: z.number().int().nonnegative(),
  classifiedProductCount: z.number().int().nonnegative(),
  unclassifiedProductCount: z.number().int().nonnegative(),
  grades: z.array(ProductAbcGradeResultSchema),
}).strict();
export type ProductAbcRecalculationResult = z.infer<
  typeof ProductAbcRecalculationResultSchema
>;
