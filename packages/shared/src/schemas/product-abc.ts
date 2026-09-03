import { z } from 'zod';
import { zIsoDate } from './common.js';

const CalendarDateSchema = z.string().regex(
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  'Expected a KST calendar date (YYYY-MM-DD)',
);
const FiniteNumberSchema = z.number().finite();
const ChecksumSchema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 checksum');
const GenerationSchema = z.string().regex(/^\d+$/, 'Generation must be a decimal string');
const UuidSchema = z.string().uuid();

export const ProductAbcGradeSchema = z.enum(['A', 'B', 'C']);
export type ProductAbcGrade = z.infer<typeof ProductAbcGradeSchema>;

/** The API derives these labels; no label is persisted on an Evaluation. */
export const ProductAbcDisplayStatusSchema = z.enum([
  'SOURCE_UNMAPPED',
  'SELLPIA_SOURCE_STALE',
  'AD_SOURCE_STALE',
  'INSUFFICIENT_EVIDENCE',
  'READY',
]);
export type ProductAbcDisplayStatus = z.infer<typeof ProductAbcDisplayStatusSchema>;

export const ProductAbcCostStatusSchema = z.enum([
  'OBSERVED',
  'CONFIRMED_ZERO',
  'NOT_APPLIED',
  'STALE',
  'MISSING',
]);
export type ProductAbcCostStatus = z.infer<typeof ProductAbcCostStatusSchema>;

const ProductAbcObservedCostComponentSchema = z.object({
  amount: z.number().int().nonnegative(),
  status: z.literal('OBSERVED'),
}).strict();

const ProductAbcConfirmedZeroCostComponentSchema = z.object({
  // CONFIRMED_ZERO is provider-observed zero, never a missing/null amount.
  amount: z.literal(0),
  status: z.literal('CONFIRMED_ZERO'),
}).strict();

const ProductAbcNotAppliedCostComponentSchema = z.object({
  // NOT_APPLIED is an intentional formula exclusion, represented explicitly
  // as zero rather than being confused with missing source evidence.
  amount: z.literal(0),
  status: z.literal('NOT_APPLIED'),
}).strict();

const ProductAbcUnavailableCostComponentSchema = z.object({
  // An unavailable source is not silently converted to a calculation zero.
  amount: z.null(),
  status: z.enum(['STALE', 'MISSING']),
}).strict();

export const ProductAbcCostComponentSchema = z.union([
  ProductAbcObservedCostComponentSchema,
  ProductAbcConfirmedZeroCostComponentSchema,
  ProductAbcNotAppliedCostComponentSchema,
  ProductAbcUnavailableCostComponentSchema,
]);
export type ProductAbcCostComponent = z.infer<typeof ProductAbcCostComponentSchema>;

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

export const ProductAbcSourceStatusSchema = z.enum([
  'READY',
  'STALE',
  'MISSING',
  'UNMAPPED',
]);
export type ProductAbcSourceStatus = z.infer<typeof ProductAbcSourceStatusSchema>;

export const ProductAbcMappingStatusSchema = z.enum([
  'READY',
  'UNMAPPED',
  'AMBIGUOUS',
  'STALE',
]);
export type ProductAbcMappingStatus = z.infer<typeof ProductAbcMappingStatusSchema>;

const AnchorPointSchema = z.object({
  value: FiniteNumberSchema,
  score: FiniteNumberSchema.min(0).max(100),
}).strict();

const AnchorsSchema = z.object({
  profitVelocity30: z.array(AnchorPointSchema).length(6),
  operatingMargin: z.array(AnchorPointSchema).length(6),
  lossPersistence: z.array(AnchorPointSchema).length(6),
}).strict();

/** V1's fixed interpolation knots. Changing one requires a new formula version. */
export const PRODUCT_ABC_ABSOLUTE_V1_ANCHORS = {
  profitVelocity30: [
    { value: 0, score: 0 },
    { value: 100_000, score: 20 },
    { value: 300_000, score: 40 },
    { value: 600_000, score: 60 },
    { value: 1_200_000, score: 80 },
    { value: 2_400_000, score: 100 },
  ],
  operatingMargin: [
    { value: 0, score: 0 },
    { value: 0.05, score: 20 },
    { value: 0.1, score: 40 },
    { value: 0.15, score: 60 },
    { value: 0.2, score: 80 },
    { value: 0.3, score: 100 },
  ],
  lossPersistence: [
    { value: 0, score: 100 },
    { value: 0.1, score: 80 },
    { value: 0.2, score: 60 },
    { value: 0.3, score: 40 },
    { value: 0.4, score: 20 },
    { value: 0.5, score: 0 },
  ],
} as const;

/** Explicit policy bodies keep the browser and finalizer rules reviewable. */
export const PRODUCT_ABC_CURRENT_SELLING_POLICY_BODY = {
  channels: ['coupang', 'rocket'],
  accountStatus: 'active',
  listingIsActive: true,
  activeSaleStatuses: [
    'active',
    'on_sale',
    'sale',
    'selling',
    'true',
    '활성',
    '판매 중',
    '판매중',
  ],
  offSaleStatuses: [
    'inactive',
    'off_sale',
    'stopped',
    'suspended',
    'soldout',
    'out_of_stock',
    '비활성',
    '판매 중지',
    '판매중지',
    '품절',
  ],
  statusResolutionOrder: [
    'daily_snapshot',
    'raw_status_field',
    'active_option',
    'listing_status',
    'active_listing_fallback',
  ],
  rawStatusFields: ['saleStatus', 'salesStatus', 'sale_status', '판매상태'],
  activeOptionsOnly: true,
  positiveRecipeQuantitiesOnly: true,
  activeSellpiaSkuOnly: true,
  activeMasterProductOnly: true,
  positiveCurrentStockRequired: true,
} as const;

export const PRODUCT_ABC_HISTORICAL_ADVERTISING_POLICY_BODY = {
  retainedAccountsRegardlessOfCurrentStatus: true,
  evidenceStart: 'MAX_REQUESTED_START_AND_MIN_IMMUTABLE_CREATION_OR_TARGET_DATE',
  preserveHistoricalDaysAcrossStatusChanges: true,
  freezeWholeRecipeForEveryCoveredDay: true,
  optionCreationIsNotHistoricalBoundary: true,
  requireCompleteAccountPeriodSliceReceipts: true,
  notAppliedRequiresNoApplicableMonthlyFact: true,
  confirmedZeroRequiresAllCampaignAndPaginationProof: true,
} as const;

export const PRODUCT_ABC_ALLOCATION_POLICY_BODY = {
  grain: ['account', 'listing', 'kst_business_date'],
  wholeRecipeWeight: 'SUM_POSITIVE_RECIPE_QUANTITIES',
  rounding: 'FLOOR_THEN_LARGEST_FRACTIONAL_REMAINDER',
  tieBreak: 'LOWERCASE_UUID_BYTEWISE_ASCENDING',
  integerKrw: true,
  conserveListingDaySpend: true,
  providerOptionSubsetDoesNotChangeWeight: true,
} as const;

/** SHA-256 of canonical JSON containing the two advertising policy literals. */
export const PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH =
  '5c612a721e1a6a7177cec1f8155149f390f8fc6073c90efdd577a33ddfcd84fc';

const FormulaPayloadShape = {
  formulaKey: z.literal('PRODUCT_ABC_ABSOLUTE'),
  version: z.literal(1),
  currency: z.literal('KRW'),
  operatingProfit: z.literal('OPERATING_PROFIT_V1'),
  currentSellingPolicy: z.literal('CURRENT_SELLING_MAPPING_V1'),
  historicalAdvertisingPolicy: z.literal('COUPANG_AD_EVIDENCE_V1'),
  allocationPolicy: z.literal('LISTING_DAY_LARGEST_REMAINDER_V1'),
  halfLifeDays: z.literal(90),
  velocityPeriodDays: z.literal(30),
  anchors: AnchorsSchema,
  minimumObservationDays: z.literal(30),
  maxCompleteMonths: z.literal(12),
  excludeCurrentKstMonth: z.literal(true),
  weights: z.object({
    profit: z.literal(0.5),
    margin: z.literal(0.3),
    consistency: z.literal(0.2),
  }).strict(),
  hardC: z.object({
    weightedOperatingProfitLte: z.literal(0),
    operatingMarginLte: z.literal(0),
    lossPersistenceGte: z.literal(0.5),
  }).strict(),
  gradeThresholds: z.object({
    aEconomicScoreGte: z.literal(80),
    aMarginScoreGte: z.literal(60),
    aConsistencyScoreGte: z.literal(60),
    bEconomicScoreGte: z.literal(50),
  }).strict(),
  precision: z.object({
    arithmetic: z.literal('IEEE-754_BINARY64'),
    persistedScale: z.literal(6),
    rounding: z.literal('ROUND_HALF_UP'),
    thresholdComparison: z.literal('UNROUNDED'),
  }).strict(),
  adSourcePolicyHash: ChecksumSchema,
} as const;

function sameAnchors(
  actual: z.infer<typeof AnchorsSchema>,
): boolean {
  return JSON.stringify(actual) === JSON.stringify(PRODUCT_ABC_ABSOLUTE_V1_ANCHORS);
}

export const ProductAbcFormulaPayloadSchema = z.object(FormulaPayloadShape)
  .strict()
  .superRefine((payload, context) => {
    if (!sameAnchors(payload.anchors)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['anchors'],
        message: 'PRODUCT_ABC_ABSOLUTE V1 anchors are immutable',
      });
    }
    if (payload.adSourcePolicyHash !== PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adSourcePolicyHash'],
        message: 'adSourcePolicyHash must match the canonical V1 policy literals',
      });
    }
  });
export type ProductAbcFormulaPayload = z.infer<typeof ProductAbcFormulaPayloadSchema>;

/** Formula JSON is the immutable payload; the database stores its hash separately. */
export const PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD = {
  formulaKey: 'PRODUCT_ABC_ABSOLUTE',
  version: 1,
  currency: 'KRW',
  operatingProfit: 'OPERATING_PROFIT_V1',
  currentSellingPolicy: 'CURRENT_SELLING_MAPPING_V1',
  historicalAdvertisingPolicy: 'COUPANG_AD_EVIDENCE_V1',
  allocationPolicy: 'LISTING_DAY_LARGEST_REMAINDER_V1',
  halfLifeDays: 90,
  velocityPeriodDays: 30,
  anchors: PRODUCT_ABC_ABSOLUTE_V1_ANCHORS as unknown as ProductAbcFormulaPayload['anchors'],
  minimumObservationDays: 30,
  maxCompleteMonths: 12,
  excludeCurrentKstMonth: true,
  weights: { profit: 0.5, margin: 0.3, consistency: 0.2 },
  hardC: {
    weightedOperatingProfitLte: 0,
    operatingMarginLte: 0,
    lossPersistenceGte: 0.5,
  },
  gradeThresholds: {
    aEconomicScoreGte: 80,
    aMarginScoreGte: 60,
    aConsistencyScoreGte: 60,
    bEconomicScoreGte: 50,
  },
  precision: {
    arithmetic: 'IEEE-754_BINARY64',
    persistedScale: 6,
    rounding: 'ROUND_HALF_UP',
    thresholdComparison: 'UNROUNDED',
  },
  adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
} as const satisfies ProductAbcFormulaPayload;

export const PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD_JSON =
  JSON.stringify(PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD);
// Keep this value adjacent to the payload. FormulaVersion uses it for idempotency.
export const PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD_HASH =
  '02dba3cbf6a204d89bfe8c68dfc38a17e1b410fac9f054657f63218120e2d94b';

export const ProductAbcFormulaStateSchema = z.object({
  organizationId: UuidSchema,
  activeFormulaVersionId: UuidSchema,
  formulaRevision: z.number().int().positive(),
  publicationRevision: z.number().int().nonnegative(),
  officialCutoffDate: CalendarDateSchema.nullable(),
  publishedSellpiaSourceImportRunId: UuidSchema.nullable(),
  publishedAdvertisingSourceImportRunId: UuidSchema.nullable(),
  publishedMappingGeneration: GenerationSchema.nullable(),
  mappingGeneration: GenerationSchema,
  recalculationRequestedRevision: z.number().int().nonnegative(),
  recalculatedRevision: z.number().int().nonnegative(),
}).strict().superRefine((state, context) => {
  if (state.recalculatedRevision > state.recalculationRequestedRevision) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recalculatedRevision'],
      message: 'recalculated revision cannot exceed requested revision',
    });
  }
});
export type ProductAbcFormulaState = z.infer<typeof ProductAbcFormulaStateSchema>;

const SourceFreshnessSchema = z.object({
  status: ProductAbcSourceStatusSchema,
  sourceImportRunId: UuidSchema.nullable(),
  generation: GenerationSchema.nullable(),
  coverageStartDate: CalendarDateSchema.nullable(),
  coverageEndDate: CalendarDateSchema.nullable(),
  actualCutoffDate: CalendarDateSchema.nullable(),
}).strict().superRefine((source, context) => {
  if ((source.coverageStartDate === null) !== (source.coverageEndDate === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['coverageEndDate'],
      message: 'coverage bounds must be present together',
    });
  }
  if (
    source.coverageStartDate !== null
    && source.coverageEndDate !== null
    && source.coverageStartDate > source.coverageEndDate
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['coverageEndDate'],
      message: 'coverage end must not precede coverage start',
    });
  }
  if (source.status === 'MISSING' && (source.sourceImportRunId !== null || source.generation !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceImportRunId'],
      message: 'missing sources cannot claim an immutable run',
    });
  }
});

const MappingFreshnessSchema = z.object({
  status: ProductAbcMappingStatusSchema,
  mappingGeneration: GenerationSchema.nullable(),
}).strict();

export const ProductAbcSourceFreshnessSchema = z.object({
  evaluationCutoffDate: CalendarDateSchema,
  sellpia: SourceFreshnessSchema,
  advertising: SourceFreshnessSchema,
  mapping: MappingFreshnessSchema,
}).strict();
export type ProductAbcSourceFreshness = z.infer<typeof ProductAbcSourceFreshnessSchema>;

export const ProductAbcEvaluationProvenanceSchema = z.object({
  gradeBasisCutoffDate: CalendarDateSchema,
  sellpiaSourceImportRunId: UuidSchema,
  advertisingSourceImportRunId: UuidSchema,
  sellpiaGeneration: GenerationSchema,
  advertisingGeneration: GenerationSchema,
  mappingGeneration: GenerationSchema,
}).strict();
export type ProductAbcEvaluationProvenance = z.infer<
  typeof ProductAbcEvaluationProvenanceSchema
>;

const EvaluationMetricSchema = FiniteNumberSchema;

export const ProductAbcEvaluationSchema = z.object({
  abcGrade: ProductAbcGradeSchema,
  weightedRevenue: EvaluationMetricSchema,
  weightedOrderTimeSupplyCost: EvaluationMetricSchema,
  weightedAdvertisingSpend: EvaluationMetricSchema,
  weightedOperatingProfit: EvaluationMetricSchema,
  operatingProfitVelocity30: EvaluationMetricSchema,
  operatingMargin: EvaluationMetricSchema.nullable(),
  lossPersistence: EvaluationMetricSchema,
  profitScore: EvaluationMetricSchema,
  marginScore: EvaluationMetricSchema.nullable(),
  consistencyScore: EvaluationMetricSchema,
  economicScore: EvaluationMetricSchema,
  validObservationDays: z.number().int().min(30),
  formula: ProductAbcFormulaPayloadSchema,
  formulaRevision: z.number().int().positive(),
  publicationRevision: z.number().int().positive(),
  gradeBasisCutoffDate: CalendarDateSchema,
  sellpiaSourceImportRunId: UuidSchema,
  advertisingSourceImportRunId: UuidSchema,
  sellpiaGeneration: GenerationSchema,
  advertisingGeneration: GenerationSchema,
  mappingGeneration: GenerationSchema,
  calculatedAt: zIsoDate,
}).strict().superRefine((evaluation, context) => {
  if (
    evaluation.weightedOperatingProfit > 0
    && evaluation.operatingMargin === null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['operatingMargin'],
      message: 'positive operating profit requires a defined operating margin',
    });
  }
  if (
    evaluation.weightedOperatingProfit <= 0
    && evaluation.operatingMargin !== null
    && evaluation.operatingMargin > 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['operatingMargin'],
      message: 'non-positive operating profit cannot have a positive operating margin',
    });
  }
});
export type ProductAbcEvaluation = z.infer<typeof ProductAbcEvaluationSchema>;

export const ProductAbcReadModelSchema = z.object({
  abcGrade: ProductAbcGradeSchema.nullable(),
  evaluation: ProductAbcEvaluationSchema.nullable(),
  displayStatus: ProductAbcDisplayStatusSchema,
  recalculationPending: z.boolean(),
  recalculationRequestedRevision: z.number().int().nonnegative(),
  recalculatedRevision: z.number().int().nonnegative(),
  gradeBasisCutoffDate: CalendarDateSchema.nullable(),
  actualCutoffDate: CalendarDateSchema.nullable(),
}).strict().superRefine((projection, context) => {
  if (projection.recalculatedRevision > projection.recalculationRequestedRevision) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recalculatedRevision'],
      message: 'recalculated revision cannot exceed requested revision',
    });
  }
  if (
    projection.recalculationPending
    !== (projection.recalculationRequestedRevision > projection.recalculatedRevision)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recalculationPending'],
      message: 'recalculationPending must be derived from FormulaState revisions',
    });
  }
  if (projection.evaluation === null) {
    if (projection.abcGrade !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['abcGrade'],
        message: 'a missing Evaluation cannot expose an official grade',
      });
    }
    if (projection.gradeBasisCutoffDate !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gradeBasisCutoffDate'],
        message: 'a missing Evaluation cannot expose a grade basis cutoff',
      });
    }
  } else {
    if (projection.abcGrade !== projection.evaluation.abcGrade) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['abcGrade'],
        message: 'grade cache must match the retained Evaluation',
      });
    }
    if (projection.gradeBasisCutoffDate !== projection.evaluation.gradeBasisCutoffDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gradeBasisCutoffDate'],
        message: 'grade basis cutoff must match the retained Evaluation',
      });
    }
  }
  if (projection.displayStatus === 'READY' && projection.evaluation === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evaluation'],
      message: 'READY requires an Evaluation',
    });
  }
  if (
    (projection.displayStatus === 'SOURCE_UNMAPPED'
      || projection.displayStatus === 'INSUFFICIENT_EVIDENCE')
    && (
      projection.abcGrade !== null
      || projection.evaluation !== null
      || projection.gradeBasisCutoffDate !== null
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evaluation'],
      message: `${projection.displayStatus} cannot retain an official Evaluation`,
    });
  }
});
export type ProductAbcReadModel = z.infer<typeof ProductAbcReadModelSchema>;

export const ProductAbcGradeHistorySchema = z.object({
  oldGrade: ProductAbcGradeSchema.nullable(),
  newGrade: ProductAbcGradeSchema.nullable(),
  formulaKey: z.literal('PRODUCT_ABC_ABSOLUTE'),
  formulaVersion: z.literal(1),
  formulaRevision: z.number().int().positive(),
  publicationRevision: z.number().int().positive(),
  economicScore: FiniteNumberSchema.nullable(),
  sourceCutoffDate: CalendarDateSchema,
  previousSellpiaSourceImportRunId: UuidSchema.nullable(),
  nextSellpiaSourceImportRunId: UuidSchema.nullable(),
  previousAdvertisingSourceImportRunId: UuidSchema.nullable(),
  nextAdvertisingSourceImportRunId: UuidSchema.nullable(),
  reason: z.string().trim().min(1).max(100),
  calculatedAt: zIsoDate,
}).strict().superRefine((history, context) => {
  if (history.oldGrade === history.newGrade) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['newGrade'],
      message: 'grade history records a transition, not a no-op',
    });
  }
});
export type ProductAbcGradeHistory = z.infer<typeof ProductAbcGradeHistorySchema>;

export const ProductAbcGradeResultSchema = z.object({
  masterProductId: UuidSchema,
  abcGrade: ProductAbcGradeSchema.nullable(),
  evaluation: ProductAbcEvaluationSchema.nullable(),
}).strict().superRefine((result, context) => {
  if (result.evaluation && result.evaluation.abcGrade !== result.abcGrade) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['abcGrade'],
      message: 'grade result must match its Evaluation',
    });
  }
});
export type ProductAbcGradeResult = z.infer<typeof ProductAbcGradeResultSchema>;

export const ProductAbcRecalculationResultSchema = z.object({
  changedProductCount: z.number().int().nonnegative(),
  classifiedProductCount: z.number().int().nonnegative(),
  unclassifiedProductCount: z.number().int().nonnegative(),
  formulaRevision: z.number().int().positive(),
  publicationRevision: z.number().int().nonnegative(),
  recalculationRequestedRevision: z.number().int().nonnegative(),
  recalculatedRevision: z.number().int().nonnegative(),
  grades: z.array(ProductAbcGradeResultSchema),
}).strict().superRefine((result, context) => {
  if (result.recalculatedRevision > result.recalculationRequestedRevision) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recalculatedRevision'],
      message: 'recalculated revision cannot exceed requested revision',
    });
  }
});
export type ProductAbcRecalculationResult = z.infer<typeof ProductAbcRecalculationResultSchema>;

export const ProductAbcContributionMetricStatusSchema = z.enum([
  'READY',
  'NO_DENOMINATOR',
  'SOURCE_INCOMPLETE',
]);
export type ProductAbcContributionMetricStatus = z.infer<
  typeof ProductAbcContributionMetricStatusSchema
>;

export const ProductAbcContributionMetricBasisSchema = z.object({
  status: ProductAbcContributionMetricStatusSchema,
  includedProductCount: z.number().int().nonnegative(),
  excludedProductCount: z.number().int().nonnegative(),
  denominator: z.number().int().positive().nullable(),
}).strict().superRefine((metric, context) => {
  if (metric.status === 'READY' && metric.denominator === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['denominator'],
      message: 'READY contribution metrics require a positive denominator',
    });
  }
  if (metric.status === 'NO_DENOMINATOR' && metric.denominator !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['denominator'],
      message: 'NO_DENOMINATOR cannot expose a denominator',
    });
  }
});
export type ProductAbcContributionMetricBasis = z.infer<
  typeof ProductAbcContributionMetricBasisSchema
>;

const ContributionRatioSchema = FiniteNumberSchema.min(0).max(1);
const ContributionRankSchema = z.number().int().positive().nullable();

export const ProductAbcContributionProductSchema = z.object({
  masterProductId: UuidSchema,
  revenue: z.number().int().nullable(),
  operatingProfit: z.number().int().nullable(),
  salesContribution: ContributionRatioSchema.nullable(),
  positiveOperatingProfitContribution: ContributionRatioSchema.nullable(),
  lossImpact: ContributionRatioSchema.nullable(),
  salesRank: ContributionRankSchema,
  positiveOperatingProfitRank: ContributionRankSchema,
  lossRank: ContributionRankSchema,
  cumulativeSalesContribution: ContributionRatioSchema.nullable(),
  cumulativePositiveOperatingProfitContribution: ContributionRatioSchema.nullable(),
  cumulativeLossImpact: ContributionRatioSchema.nullable(),
  metricCompleteness: z.object({
    sales: z.boolean(),
    operatingProfit: z.boolean(),
  }).strict(),
}).strict().superRefine((product, context) => {
  if (!product.metricCompleteness.sales && product.revenue !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['revenue'],
      message: 'incomplete sales evidence cannot expose revenue',
    });
  }
  if (!product.metricCompleteness.operatingProfit && product.operatingProfit !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['operatingProfit'],
      message: 'incomplete profit evidence cannot expose operating profit',
    });
  }
  if (
    product.operatingProfit !== null
    && product.operatingProfit <= 0
    && (
      product.positiveOperatingProfitRank !== null
      || product.cumulativePositiveOperatingProfitContribution !== null
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['positiveOperatingProfitRank'],
      message: 'non-positive products do not belong to the positive-profit ranking',
    });
  }
  if (
    product.operatingProfit !== null
    && product.operatingProfit >= 0
    && (product.lossRank !== null || product.cumulativeLossImpact !== null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lossRank'],
      message: 'non-loss products do not belong to the loss ranking',
    });
  }
});
export type ProductAbcContributionProduct = z.infer<
  typeof ProductAbcContributionProductSchema
>;

export const ProductAbcContributionSourceStatusSummarySchema = z.object({
  sellpia: ProductAbcSourceStatusSchema,
  advertising: ProductAbcSourceStatusSchema,
  mapping: ProductAbcMappingStatusSchema,
}).strict();

export const ProductAbcContributionBasisSchema = z.object({
  fromDate: CalendarDateSchema,
  cutoffDate: CalendarDateSchema,
  sourceCutoffDate: CalendarDateSchema.nullable(),
  sellpiaSourceImportRunId: UuidSchema.nullable(),
  advertisingSourceImportRunId: UuidSchema.nullable(),
  sourceStatusSummary: ProductAbcContributionSourceStatusSummarySchema,
}).strict().superRefine((basis, context) => {
  if (basis.fromDate > basis.cutoffDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cutoffDate'],
      message: 'contribution cutoff cannot precede the basis start',
    });
  }
});
export type ProductAbcContributionBasis = z.infer<
  typeof ProductAbcContributionBasisSchema
>;

export const ProductAbcContributionTotalsSchema = z.object({
  revenue: z.number().int().nullable(),
  positiveOperatingProfit: z.number().int().nonnegative().nullable(),
  lossMagnitude: z.number().int().nonnegative().nullable(),
  netOperatingProfit: z.number().int().nullable(),
}).strict();
export type ProductAbcContributionTotals = z.infer<
  typeof ProductAbcContributionTotalsSchema
>;

export const ProductAbcContributionAnalyticsSchema = z.object({
  basis: ProductAbcContributionBasisSchema,
  totals: ProductAbcContributionTotalsSchema,
  metrics: z.object({
    sales: ProductAbcContributionMetricBasisSchema,
    positiveOperatingProfit: ProductAbcContributionMetricBasisSchema,
    loss: ProductAbcContributionMetricBasisSchema,
  }).strict(),
  products: z.array(ProductAbcContributionProductSchema),
}).strict();
export type ProductAbcContributionAnalytics = z.infer<
  typeof ProductAbcContributionAnalyticsSchema
>;

export const ProductAbcContributionOverviewSchema =
  ProductAbcContributionAnalyticsSchema.omit({ products: true });
export type ProductAbcContributionOverview = z.infer<
  typeof ProductAbcContributionOverviewSchema
>;
