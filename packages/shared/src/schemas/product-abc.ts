import { z } from 'zod';
import { SourceReadinessSchema } from '../source-readiness.js';
import { zIsoDate } from './common.js';

const CalendarDateSchema = z.string().regex(
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  'Expected a KST calendar date (YYYY-MM-DD)',
);
const ProductAbcCalendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const ProductAbcIsoDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;
const ProductAbcNaiveDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;
const PRODUCT_ABC_KST_OFFSET_MINUTES = 9 * 60;
const PRODUCT_ABC_DAY_MS = 86_400_000;
const FiniteNumberSchema = z.number().finite();
const ChecksumSchema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 checksum');
const GenerationSchema = z.string().regex(/^\d+$/, 'Generation must be a decimal string');
const UuidSchema = z.string().uuid();

export const ProductAbcGradeSchema = z.enum(['A', 'B', 'C']);
export type ProductAbcGrade = z.infer<typeof ProductAbcGradeSchema>;

/**
 * ABC display words. `productAbcDisplayStatus` derives one from a read
 * model's facts; neither an Evaluation nor the read model carries it.
 */
export const ProductAbcDisplayStatusSchema = z.enum([
  'SOURCE_UNMAPPED',
  'SELLPIA_SOURCE_STALE',
  'AD_SOURCE_STALE',
  'INSUFFICIENT_EVIDENCE',
  'READY',
]);
export type ProductAbcDisplayStatus = z.infer<typeof ProductAbcDisplayStatusSchema>;

/**
 * Parses the provider's sale-start value without allowing Date.parse to roll
 * an invalid calendar or clock value into a different day. Date-only values
 * are already KST calendar dates; timestamp values are normalized to KST.
 */
export function parseProductAbcDateToKstCalendarDate(
  value: unknown,
  options: Readonly<{ allowNaiveKstTimestamp?: boolean }> = {},
): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const candidate = value.trim();
  const dateOnly = ProductAbcCalendarDatePattern.exec(candidate);
  if (dateOnly) {
    return isValidProductAbcCalendarParts(dateOnly) ? candidate : null;
  }
  const timestamp = ProductAbcIsoDateTimePattern.exec(candidate);
  const naiveTimestamp = ProductAbcNaiveDateTimePattern.exec(candidate);
  if ((!timestamp && !naiveTimestamp)
    || (naiveTimestamp && options.allowNaiveKstTimestamp !== true)) return null;
  const parts = timestamp ?? naiveTimestamp!;
  if (!isValidProductAbcCalendarParts(parts)) return null;

  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  const millis = Number((parts[7] ?? '').padEnd(3, '0') || 0);
  const zone = naiveTimestamp ? '+09:00' : parts[8]!;
  if (hour > 23 || minute > 59 || second > 59 || millis > 999) return null;
  const offsetMinutes = zone === 'Z'
    ? 0
    : Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6));
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)) {
    return null;
  }

  const local = new Date(0);
  local.setUTCFullYear(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
  );
  local.setUTCHours(hour, minute, second, millis);
  const utcMillis = local.getTime() - (zone.startsWith('-') ? -offsetMinutes : offsetMinutes) * 60_000;
  if (!Number.isFinite(utcMillis)) return null;
  const kst = new Date(utcMillis + PRODUCT_ABC_KST_OFFSET_MINUTES * 60_000);
  return `${String(kst.getUTCFullYear()).padStart(4, '0')}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`;
}

/** Returns elapsed KST calendar days, or null when either date is invalid. */
export function productAbcSaleAgeDays(
  saleStartDate: string | null,
  cutoffDate: string | null,
): number | null {
  const start = parseProductAbcDateToKstCalendarDate(saleStartDate);
  const cutoff = parseProductAbcDateToKstCalendarDate(cutoffDate);
  if (!start || !cutoff) return null;
  const startDay = productAbcCalendarEpochDay(start);
  const cutoffDay = productAbcCalendarEpochDay(cutoff);
  if (startDay === null || cutoffDay === null || cutoffDay < startDay) return null;
  return cutoffDay - startDay;
}

function isValidProductAbcCalendarParts(parts: RegExpExecArray): boolean {
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1
    && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function productAbcCalendarEpochDay(value: string): number | null {
  const match = ProductAbcCalendarDatePattern.exec(value);
  if (!match || !isValidProductAbcCalendarParts(match)) return null;
  const date = new Date(0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setUTCHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / PRODUCT_ABC_DAY_MS);
}

export const ProductAbcMappingStatusSchema = z.enum([
  'READY',
  'UNMAPPED',
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

/** The current fixed interpolation knots. Changing one requires a new formula version. */
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

/**
 * The same canonical form with advertising excluded — formula version 3, which
 * grades on Sellpia sales and purchase cost alone (owner decision 2026-09-18:
 * grade now, while no advertising generation has ever been collected).
 */
export const PRODUCT_ABC_ABSOLUTE_AD_FREE_AD_SOURCE_POLICY_HASH =
  '3a3400e40c0b75dd4d187f304b1c4c6d9b05174aa47b1e4127a1b177c47d2e63';

const AD_SOURCE_POLICY_HASH_BY_POLICY = {
  COUPANG_AD_EVIDENCE_V1: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
  EXCLUDED_V1: PRODUCT_ABC_ABSOLUTE_AD_FREE_AD_SOURCE_POLICY_HASH,
} as const;

const FormulaPayloadShape = {
  formulaKey: z.literal('PRODUCT_ABC_ABSOLUTE'),
  version: z.union([z.literal(2), z.literal(3)]),
  currency: z.literal('KRW'),
  operatingProfit: z.literal('OPERATING_PROFIT_V1'),
  currentSellingPolicy: z.literal('CURRENT_SELLING_MAPPING_V1'),
  historicalAdvertisingPolicy: z.enum(['COUPANG_AD_EVIDENCE_V1', 'EXCLUDED_V1']),
  allocationPolicy: z.literal('LISTING_DAY_LARGEST_REMAINDER_V1'),
  halfLifeDays: z.literal(90),
  velocityPeriodDays: z.literal(30),
  anchors: AnchorsSchema,
  minimumSaleAgeDays: z.literal(30),
  requiresCompleteEvaluationPeriod: z.literal(true),
  maxCalendarMonths: z.literal(12),
  includePartialCutoffMonth: z.literal(true),
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
        message: 'PRODUCT_ABC_ABSOLUTE anchors are immutable',
      });
    }
    if (payload.adSourcePolicyHash !== AD_SOURCE_POLICY_HASH_BY_POLICY[payload.historicalAdvertisingPolicy]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adSourcePolicyHash'],
        message: 'adSourcePolicyHash must match the canonical policy literals',
      });
    }
    // Version 3 is the advertising-free formula and nothing else.
    if ((payload.version === 3) !== (payload.historicalAdvertisingPolicy === 'EXCLUDED_V1')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['historicalAdvertisingPolicy'],
        message: 'formula version 3 excludes advertising; version 2 includes it',
      });
    }
  });
export type ProductAbcFormulaPayload = z.infer<typeof ProductAbcFormulaPayloadSchema>;

/** Formula JSON is the immutable payload; the database stores its hash separately. */
export const PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD = {
  formulaKey: 'PRODUCT_ABC_ABSOLUTE',
  version: 2,
  currency: 'KRW',
  operatingProfit: 'OPERATING_PROFIT_V1',
  currentSellingPolicy: 'CURRENT_SELLING_MAPPING_V1',
  historicalAdvertisingPolicy: 'COUPANG_AD_EVIDENCE_V1',
  allocationPolicy: 'LISTING_DAY_LARGEST_REMAINDER_V1',
  halfLifeDays: 90,
  velocityPeriodDays: 30,
  anchors: PRODUCT_ABC_ABSOLUTE_V1_ANCHORS as unknown as ProductAbcFormulaPayload['anchors'],
  minimumSaleAgeDays: 30,
  requiresCompleteEvaluationPeriod: true,
  maxCalendarMonths: 12,
  includePartialCutoffMonth: true,
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

export const PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_JSON =
  JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD);
// Keep this value adjacent to the payload. FormulaVersion uses it for idempotency.
export const PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH =
  '230d35436ffd2fd42bf4eb4ea3f0c99bd7474dcf5b7cf11f6ed235aff84cc64f';

/** Version 3: the same formula with advertising excluded from operating profit. */
export const PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD = {
  ...PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  version: 3,
  historicalAdvertisingPolicy: 'EXCLUDED_V1',
  adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_AD_FREE_AD_SOURCE_POLICY_HASH,
} as const satisfies ProductAbcFormulaPayload;

export const PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_JSON =
  JSON.stringify(PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD);
// Keep this value adjacent to the payload. FormulaVersion uses it for idempotency.
export const PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_HASH =
  '256a0fa3b3724e5a3283a1bb0a0ae5d828d7af3b70485aaf8be828a130287a35';

/** Whether a formula grades without advertising — no ad generation, no ad spend. */
export function productAbcExcludesAdvertising(
  formula: Pick<ProductAbcFormulaPayload, 'historicalAdvertisingPolicy'> | null | undefined,
): boolean {
  return formula?.historicalAdvertisingPolicy === 'EXCLUDED_V1';
}

export const ProductAbcMappingFactsSchema = z.object({
  valid: z.boolean(),
  currentMappingGeneration: GenerationSchema,
  evidenceMappingGeneration: GenerationSchema.nullable(),
}).strict();
export type ProductAbcMappingFacts = z.infer<typeof ProductAbcMappingFactsSchema>;

export const ProductAbcSourceFreshnessSchema = z.object({
  evaluationCutoffDate: CalendarDateSchema,
  sellpia: SourceReadinessSchema,
  advertising: SourceReadinessSchema,
  mapping: ProductAbcMappingFactsSchema,
  /**
   * False under a formula that excludes advertising: its readiness is still
   * reported, but a grade no longer waits on it. Absent means required.
   */
  advertisingRequired: z.boolean().optional(),
}).strict();
export type ProductAbcSourceFreshness = z.infer<typeof ProductAbcSourceFreshnessSchema>;

export const ProductAbcEvaluationProvenanceSchema = z.object({
  gradeBasisCutoffDate: CalendarDateSchema,
  sellpiaOperationId: UuidSchema,
  /** Null only under a formula that excludes advertising. */
  advertisingSourceImportRunId: UuidSchema.nullable(),
  sellpiaGeneration: GenerationSchema,
  advertisingGeneration: GenerationSchema.nullable(),
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
  validObservationDays: z.number().int().positive(),
  formula: ProductAbcFormulaPayloadSchema,
  formulaRevision: z.number().int().positive(),
  publicationRevision: z.number().int().positive(),
  gradeBasisCutoffDate: CalendarDateSchema,
  saleStartDate: CalendarDateSchema.nullable(),
  sellpiaOperationId: UuidSchema,
  /** Null only under a formula that excludes advertising. */
  advertisingSourceImportRunId: UuidSchema.nullable(),
  sellpiaGeneration: GenerationSchema,
  advertisingGeneration: GenerationSchema.nullable(),
  mappingGeneration: GenerationSchema,
  calculatedAt: zIsoDate,
}).strict().superRefine((evaluation, context) => {
  const adFree = evaluation.formula.historicalAdvertisingPolicy === 'EXCLUDED_V1';
  if (adFree !== (evaluation.advertisingSourceImportRunId === null)
    || adFree !== (evaluation.advertisingGeneration === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['advertisingSourceImportRunId'],
      message: 'advertising provenance is absent exactly when the formula excludes advertising',
    });
  }
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
  formulaRevision: z.number().int().nonnegative(),
  publicationRevision: z.number().int().nonnegative(),
  officialCutoffDate: CalendarDateSchema.nullable(),
  publishedAt: zIsoDate.nullable(),
  actualCutoffDate: CalendarDateSchema.nullable(),
  sources: ProductAbcSourceFreshnessSchema.omit({ evaluationCutoffDate: true }),
}).strict().superRefine((projection, context) => {
  if (projection.evaluation === null) {
    if (projection.abcGrade !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['abcGrade'],
        message: 'a missing Evaluation cannot expose an official grade',
      });
    }
  } else {
    if (projection.abcGrade !== projection.evaluation.abcGrade) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['abcGrade'],
        message: 'official grade must match the retained Evaluation',
      });
    }
    if (projection.officialCutoffDate !== projection.evaluation.gradeBasisCutoffDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['officialCutoffDate'],
        message: 'grade basis cutoff must match the retained Evaluation',
      });
    }
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
  previousSellpiaOperationId: UuidSchema.nullable(),
  nextSellpiaOperationId: UuidSchema.nullable(),
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

export const ProductAbcContributionMetricStatusSchema = z.enum([
  'READY',
  'NO_DENOMINATOR',
  'SOURCE_INCOMPLETE',
]);
export type ProductAbcContributionMetricStatus = z.infer<
  typeof ProductAbcContributionMetricStatusSchema
>;

export const ProductAbcContributionMetricBasisSchema = z.object({
  sourceComplete: z.boolean(),
  includedProductCount: z.number().int().nonnegative(),
  excludedProductCount: z.number().int().nonnegative(),
  denominator: z.number().int().positive().nullable(),
}).strict();
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

export const ProductAbcContributionBasisSchema = z.object({
  fromDate: CalendarDateSchema,
  cutoffDate: CalendarDateSchema,
  sourceCutoffDate: CalendarDateSchema.nullable(),
  sellpiaOperationId: UuidSchema.nullable(),
  advertisingSourceImportRunId: UuidSchema.nullable(),
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
