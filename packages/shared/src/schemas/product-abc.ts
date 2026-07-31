import { z } from 'zod';
import { zIsoDate } from './common.js';

export const ProductAbcGradeSchema = z.enum(['A', 'B', 'C']);
export type ProductAbcGrade = z.infer<typeof ProductAbcGradeSchema>;

export const MasterProductAbcMetricSchema = z.enum([
  'SALES_QUANTITY',
  'SALES_AMOUNT',
  'GROSS_PROFIT',
]);
export type MasterProductAbcMetric = z.infer<typeof MasterProductAbcMetricSchema>;

export const MasterProductAbcPeriodDaysSchema = z.union([
  z.literal(30),
  z.literal(90),
  z.literal(180),
  z.literal(360),
]);
export type MasterProductAbcPeriodDays = z.infer<
  typeof MasterProductAbcPeriodDaysSchema
>;

const MasterProductAbcPolicyFieldsSchema = z.object({
  metric: MasterProductAbcMetricSchema,
  periodDays: MasterProductAbcPeriodDaysSchema,
  aCumulativeThreshold: z.number().int().min(1).max(99),
  bCumulativeThreshold: z.number().int().min(2).max(100),
  minProvisionalMonths: z.number().int().min(1).max(11).default(3),
  minClassifiedMonths: z.number().int().min(2).max(12).default(6),
}).strict();

function validatePolicyThresholds(
  policy: z.infer<typeof MasterProductAbcPolicyFieldsSchema>,
  context: z.RefinementCtx,
) {
    if (policy.aCumulativeThreshold >= policy.bCumulativeThreshold) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bCumulativeThreshold'],
        message: 'bCumulativeThreshold must be greater than aCumulativeThreshold',
      });
    }
    if (policy.minProvisionalMonths >= policy.minClassifiedMonths) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minClassifiedMonths'],
        message: 'minClassifiedMonths must be greater than minProvisionalMonths',
      });
    }
}

export const MasterProductAbcPolicySchema = MasterProductAbcPolicyFieldsSchema
  .superRefine(validatePolicyThresholds);
export type MasterProductAbcPolicy = z.infer<
  typeof MasterProductAbcPolicySchema
>;

export const DEFAULT_MASTER_PRODUCT_ABC_POLICY = {
  metric: 'GROSS_PROFIT',
  periodDays: 360,
  aCumulativeThreshold: 70,
  bCumulativeThreshold: 90,
  minProvisionalMonths: 3,
  minClassifiedMonths: 6,
} as const satisfies MasterProductAbcPolicy;

export const UpdateMasterProductAbcPolicySchema = MasterProductAbcPolicySchema;
export type UpdateMasterProductAbcPolicy = z.infer<
  typeof UpdateMasterProductAbcPolicySchema
>;

export const MasterProductAbcPolicyResponseSchema =
  MasterProductAbcPolicyFieldsSchema.extend({
    lastCalculatedAt: zIsoDate.nullable(),
    sourceCapturedAt: zIsoDate.nullable(),
  }).superRefine(validatePolicyThresholds);
export type MasterProductAbcPolicyResponse = z.infer<
  typeof MasterProductAbcPolicyResponseSchema
>;

export const MasterProductAbcLifecycleStageSchema = z.enum([
  'NEW',
  'PROVISIONAL',
  'ESTABLISHED',
]);
export type MasterProductAbcLifecycleStage = z.infer<
  typeof MasterProductAbcLifecycleStageSchema
>;

export const MasterProductAbcConfidenceSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type MasterProductAbcConfidence = z.infer<typeof MasterProductAbcConfidenceSchema>;

export const MasterProductAbcEligibilityReasonSchema = z.enum([
  'ELIGIBLE',
  'INACTIVE_PRODUCT',
  'MISSING_RECIPE',
  'SHARED_SKU',
  'INACTIVE_SKU',
  'INCOMPLETE_MONTHS',
  'MISSING_COST',
  'NO_OBSERVATION',
]);
export type MasterProductAbcEligibilityReason = z.infer<
  typeof MasterProductAbcEligibilityReasonSchema
>;

export const MasterProductAbcRiskFlagSchema = z.enum([
  'LOSS',
  'ZERO_VALUE',
  'LIMITED_HISTORY',
]);
export type MasterProductAbcRiskFlag = z.infer<typeof MasterProductAbcRiskFlagSchema>;

const MasterProductAbcFiniteNumberSchema = z.number().finite();
const MasterProductAbcEvaluationFieldsSchema = z.object({
  // Official grade is stored on MasterProduct and combined with this evidence in
  // read mappers. It is not duplicated as a writable evaluation-table column.
  abcGrade: ProductAbcGradeSchema.nullable(),
  provisionalGrade: ProductAbcGradeSchema.nullable(),
  lifecycleStage: MasterProductAbcLifecycleStageSchema,
  confidence: MasterProductAbcConfidenceSchema,
  eligibilityReason: MasterProductAbcEligibilityReasonSchema,
  riskFlags: z.array(MasterProductAbcRiskFlagSchema).max(3),
  observedCompleteMonths: z.number().int().min(0).max(12),
  observationStartMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable(),
  periodMetricValue: MasterProductAbcFiniteNumberSchema.nullable(),
  rankingValue: MasterProductAbcFiniteNumberSchema.nullable(),
  grossRevenue: z.number().int().nonnegative().nullable(),
  grossCost: z.number().int().nonnegative().nullable(),
  grossProfit: z.number().int().nullable(),
  grossMarginRate: MasterProductAbcFiniteNumberSchema.nullable(),
  contributionRate: MasterProductAbcFiniteNumberSchema.min(0).max(100).nullable(),
  cumulativeContributionRate: MasterProductAbcFiniteNumberSchema.min(0).max(100).nullable(),
  calculatedAt: zIsoDate.nullable(),
  sourceCapturedAt: zIsoDate.nullable(),
}).strict();

export const MasterProductAbcEvaluationSchema = MasterProductAbcEvaluationFieldsSchema
  .superRefine((evaluation, context) => {
    if (
      evaluation.lifecycleStage === 'NEW'
      && (evaluation.abcGrade !== null || evaluation.provisionalGrade !== null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['abcGrade'],
        message: 'NEW evaluations cannot have official or provisional grades',
      });
    }
    if (evaluation.lifecycleStage === 'PROVISIONAL' && evaluation.abcGrade !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['abcGrade'],
        message: 'PROVISIONAL evaluations cannot have an official grade',
      });
    }
    if (evaluation.lifecycleStage === 'ESTABLISHED' && evaluation.provisionalGrade !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['provisionalGrade'],
        message: 'ESTABLISHED evaluations cannot have a provisional grade',
      });
    }
  });
export type MasterProductAbcEvaluation = z.infer<typeof MasterProductAbcEvaluationSchema>;

export const MasterProductAbcGradeResultSchema = z
  .object({
    masterProductId: z.string().uuid(),
    abcGrade: ProductAbcGradeSchema.nullable(),
    evaluation: MasterProductAbcEvaluationSchema.nullable(),
  })
  .strict();
export type MasterProductAbcGradeResult = z.infer<
  typeof MasterProductAbcGradeResultSchema
>;

export const MasterProductAbcRecalculationResultSchema = z
  .object({
    changedProductCount: z.number().int().nonnegative(),
    classifiedProductCount: z.number().int().nonnegative(),
    unclassifiedProductCount: z.number().int().nonnegative(),
    grades: z.array(MasterProductAbcGradeResultSchema),
  })
  .strict();
export type MasterProductAbcRecalculationResult = z.infer<
  typeof MasterProductAbcRecalculationResultSchema
>;
