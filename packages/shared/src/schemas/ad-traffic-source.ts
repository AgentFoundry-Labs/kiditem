import { z } from 'zod';
import { zIsoDate } from './common';
import {
  businessDateKey,
  datesInclusive,
  inclusiveDayCount,
  parseBusinessDate,
} from '../common.js';

const timestamp = zIsoDate
  .transform((value) => (value instanceof Date ? value.toISOString() : value))
  .pipe(z.string().datetime({ offset: true }));
// Keep receipt identity values byte-for-byte stable: the owner hashes the raw
// payload for replay, so parsing must not normalize whitespace.
const id = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().date();
const payload = z.record(z.string(), z.unknown());
const metric = z.number().finite().int().safe();
const providerRatio = z.number().finite().nullable();

/**
 * The longest range an operator may start collecting at once. A longer plan an
 * earlier release admitted still reads, uploads and finalizes: the plan and
 * receipt schemas below keep accepting up to 366 days.
 */
export const WING_TRAFFIC_MAX_COLLECTION_DAYS = 92;

/** The browser may suggest a range/URL; the owner freezes the accepted values. */
export const AdTrafficSourceBeginSchema = z
  .object({
    channelAccountId: z.string().uuid().optional(),
    startDate: date.optional(),
    endDate: date.optional(),
    url: z.string().url().max(2048).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.startDate || !value.endDate) return;
    const start = parseBusinessDate(value.startDate);
    const end = parseBusinessDate(value.endDate);
    if (start && end && inclusiveDayCount(start, end) > WING_TRAFFIC_MAX_COLLECTION_DAYS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: `A collection range must not exceed ${WING_TRAFFIC_MAX_COLLECTION_DAYS} days.`,
      });
    }
  });

const dateRangeFields = {
  startDate: date,
  endDate: date,
};

function expectedDates(startDate: string, endDate: string): string[] {
  const start = parseBusinessDate(startDate);
  const end = parseBusinessDate(endDate);
  if (!start || !end) return [];
  const count = inclusiveDayCount(start, end);
  return count >= 1 && count <= 366
    ? datesInclusive(start, end).map(businessDateKey)
    : [];
}

const dailyPlanSchema = z
  .object({
    sourceType: z.literal('coupang_wing_traffic'),
    parserVersion: z.literal('wing-traffic-daily-v2'),
    channelAccountId: z.string().uuid(),
    expectedAdvertiserId: id,
    providerVendorId: id,
    ...dateRangeFields,
    /** Kept for compatibility with the source-run row; it is not a daily key. */
    businessDate: date,
    periodDays: z.number().int().positive().max(366),
    expectedDates: z.array(date).min(1).max(366),
    filterScope: z.literal('ALL_NORMAL_RFM'),
    targetUrl: z.string().url().max(2048).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const expected = expectedDates(value.startDate, value.endDate);
    if (value.providerVendorId !== value.expectedAdvertiserId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['providerVendorId'],
        message: 'providerVendorId must match expectedAdvertiserId.',
      });
    }
    if (expected.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'The inclusive date range must contain one to 366 days.',
      });
    }
    if (value.businessDate !== value.endDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['businessDate'],
        message: 'businessDate is a compatibility field and must equal endDate.',
      });
    }
    if (value.periodDays !== expected.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodDays'],
        message: 'periodDays must match the inclusive date range.',
      });
    }
    if (value.expectedDates.join('|') !== expected.join('|')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedDates'],
        message: 'expectedDates must be sorted and inclusive for startDate..endDate.',
      });
    }
  });

/**
 * The daily-grain collector's plan. The historical page collector (`wing-traffic-v1`)
 * is retired: a v1 plan no longer parses (KID-232).
 */
export const AdTrafficSourcePlanSchema = dailyPlanSchema;
export const AdTrafficSourceDailyPlanSchema = dailyPlanSchema;

export const AdTrafficPaginationProofSchema = z
  .object({
    expectedPages: z.number().int().positive().max(100),
    visitedPages: z.array(z.number().int().positive()).max(100),
    terminalPageObserved: z.boolean(),
    verified: z.boolean(),
    complete: z.boolean(),
    explicitEmpty: z.boolean().optional(),
  })
  .strict();

export const AdTrafficAccountSummarySchema = z
  .object({
    visitors: metric,
    views: metric,
    cartAdds: metric,
    orders: metric,
    salesQty: metric,
    revenue: metric,
    providerConversionRate: providerRatio,
  })
  .strict();

const receiptIdentity = {
  key: id.max(160),
  capturedAt: timestamp,
  url: z.string().url().max(2048),
  providerVendorId: id,
};

const accountSummaryFields = {
  accountSummary: AdTrafficAccountSummarySchema,
  accountSummaryRaw: payload,
};

const dailyReceiptInputSchema = z
  .object({
    ...receiptIdentity,
    kind: z.literal('daily_page'),
    filterScope: z.literal('ALL_NORMAL_RFM'),
    businessDate: date,
    startDate: date,
    endDate: date,
    period: z.literal(1),
    pageIndex: z.number().int().positive().max(100),
    proof: AdTrafficPaginationProofSchema,
    data: z.array(payload).max(5000),
    accountSummary: AdTrafficAccountSummarySchema.optional(),
    accountSummaryRaw: payload.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.businessDate !== value.startDate || value.businessDate !== value.endDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['businessDate'],
        message: 'A daily receipt must use a single businessDate range.',
      });
    }
    const hasSummary = value.accountSummary !== undefined;
    const hasRaw = value.accountSummaryRaw !== undefined;
    if (value.pageIndex === 1 && !hasSummary) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountSummary'],
        message: 'The first daily page must include accountSummary.',
      });
    }
    if (hasSummary !== hasRaw) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountSummaryRaw'],
        message: 'accountSummary and accountSummaryRaw must be supplied together.',
      });
    }
  });

const periodReceiptInputSchema = z
  .object({
    ...receiptIdentity,
    kind: z.literal('period_summary'),
    filterScope: z.literal('ALL_NORMAL_RFM'),
    ...dateRangeFields,
    period: z.number().int().positive().max(366),
    ...accountSummaryFields,
  })
  .strict();

export const AdTrafficSourceDailyReceiptInputSchema = dailyReceiptInputSchema;
export const AdTrafficSourcePeriodReceiptInputSchema = periodReceiptInputSchema;
export const AdTrafficSourceReceiptInputSchema = z.union([
  dailyReceiptInputSchema,
  periodReceiptInputSchema,
]);

const dailyReceiptSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    kind: z.literal('daily_page'),
    key: id,
    checksum,
    providerVendorId: id,
    filterScope: z.literal('ALL_NORMAL_RFM'),
    capturedAt: timestamp,
    businessDate: date,
    pageIndex: z.number().int().positive(),
    expectedPages: z.number().int().positive(),
    rowCount: z.number().int().nonnegative(),
    matchedCount: z.number().int().nonnegative(),
    unmatchedCount: z.number().int().nonnegative(),
    snapshotIds: z.array(z.string().uuid()),
    url: z.string().url().max(2048),
    startDate: date,
    endDate: date,
    terminalPageObserved: z.boolean(),
  })
  .strict();

const periodReceiptSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    kind: z.literal('period_summary'),
    key: id,
    checksum,
    providerVendorId: id,
    filterScope: z.literal('ALL_NORMAL_RFM'),
    capturedAt: timestamp,
    startDate: date,
    endDate: date,
    period: z.number().int().positive(),
    rowCount: z.literal(0),
    matchedCount: z.literal(0),
    unmatchedCount: z.literal(0),
    snapshotIds: z.array(z.string().uuid()).length(0),
    url: z.string().url().max(2048),
  })
  .strict();

export const AdTrafficSourceDailyReceiptSchema = dailyReceiptSchema;
export const AdTrafficSourcePeriodReceiptSchema = periodReceiptSchema;
export const AdTrafficSourceReceiptSchema = z.union([
  dailyReceiptSchema,
  periodReceiptSchema,
]);

export const AdTrafficSourceAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  plan: AdTrafficSourcePlanSchema,
  expiresAt: timestamp,
  actualCutoffAt: timestamp.nullable(),
  manifestChecksum: checksum,
  rowCount: z.number().int().nonnegative(),
  matchedRowCount: z.number().int().nonnegative(),
  unmatchedRowCount: z.number().int().nonnegative(),
  receiptCount: z.number().int().nonnegative(),
  expectedPages: z.number().int().positive().nullable(),
  terminalPageObserved: z.boolean(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export const AdTrafficSourceControlSchema = AdTrafficSourceAttemptSchema.extend({
  attemptToken: z.string().uuid(),
  receipts: z.array(AdTrafficSourceReceiptSchema),
});

export const AdTrafficSourceStatusSchema = z.object({
  knownThrough: date,
  channelAccountId: z.string().uuid().nullable(),
  ready: z.boolean(),
  latestAttempt: AdTrafficSourceAttemptSchema.nullable(),
  latestComplete: AdTrafficSourceAttemptSchema.nullable(),
  actualCutoffAt: timestamp.nullable(),
});

const trafficFields = {
  visitors: metric,
  views: metric,
  cartAdds: metric,
  orders: metric,
  salesQty: metric,
  revenue: metric,
};

const accountDailySchema = z
  .object({
    businessDate: date,
    observedAt: timestamp,
    sourceAttemptId: z.string().uuid(),
    providerConversionRate: providerRatio,
    ...trafficFields,
  })
  .strict();

const optionDailySchema = z
  .object({
    businessDate: date,
    observedAt: timestamp,
    sourceAttemptId: z.string().uuid(),
    listingId: z.string().uuid().nullable(),
    listingOptionId: z.string().uuid().nullable(),
    externalId: z.string().nullable(),
    externalOptionId: z.string().nullable(),
    traffic: z.object(trafficFields).strict(),
  })
  .strict();

const reconciliationMetricSchema = z
  .object({
    dailySum: metric.nullable(),
    periodValue: metric.nullable(),
  })
  .strict();

const reconciliationSchema = z
  .object({
    views: reconciliationMetricSchema,
    cartAdds: reconciliationMetricSchema,
    orders: reconciliationMetricSchema,
    salesQty: reconciliationMetricSchema,
    revenue: reconciliationMetricSchema,
  })
  .strict();

export type AdTrafficReconciliationStatus = 'MATCHED' | 'MISMATCH' | 'UNVERIFIED';

/**
 * The one derivation of a traffic reconciliation word: the summed daily rows
 * against the provider's period value. Either side unmeasured is unverified.
 */
export function adTrafficReconciliationStatus(metric: {
  dailySum: number | null;
  periodValue: number | null;
}): AdTrafficReconciliationStatus {
  if (metric.dailySum === null || metric.periodValue === null) return 'UNVERIFIED';
  return metric.dailySum === metric.periodValue ? 'MATCHED' : 'MISMATCH';
}

const coverageSchema = z
  .object({
    from: date,
    to: date,
    targetDays: z.number().int().nonnegative(),
    completedDays: z.number().int().nonnegative(),
    missingDates: z.array(date),
  })
  .strict();

const periodSummarySchema = z
  .object({
    startDate: date,
    endDate: date,
    observedAt: timestamp,
    sourceAttemptId: z.string().uuid(),
    providerVendorId: id,
    filterScope: z.literal('ALL_NORMAL_RFM'),
    accountSummary: AdTrafficAccountSummarySchema,
    accountSummaryRaw: payload,
  })
  .strict();

const dailyPublishedSchema = z
  .object({
    channelAccountId: z.string().uuid(),
    attemptId: z.string().uuid(),
    plan: dailyPlanSchema,
    providerVendorId: id,
    filterScope: z.literal('ALL_NORMAL_RFM'),
    accountDaily: z.array(accountDailySchema),
    optionDaily: z.array(optionDailySchema),
    periodSummary: periodSummarySchema.nullable(),
    coverage: coverageSchema,
    reconciliation: reconciliationSchema,
  })
  .strict();

export const AdTrafficSourceAccountDailySchema = accountDailySchema;
export const AdTrafficSourceOptionDailySchema = optionDailySchema;
export const AdTrafficSourceCoverageSchema = coverageSchema;
export const AdTrafficSourceReconciliationSchema = reconciliationSchema;
export const AdTrafficSourceDailyPublishedSchema = dailyPublishedSchema;
export const AdTrafficSourcePublishedSchema = dailyPublishedSchema;

export const AdTrafficSourceCompleteSchema = z
  .object({ manifestChecksum: checksum })
  .strict();

export const AdTrafficSourceFailureSchema = z
  .object({ code: id.max(100), message: id.max(300) })
  .strict();

export type AdTrafficSourceBegin = z.infer<typeof AdTrafficSourceBeginSchema>;
export type AdTrafficSourcePlan = z.infer<typeof AdTrafficSourcePlanSchema>;
export type AdTrafficSourceDailyPlan = z.infer<typeof AdTrafficSourceDailyPlanSchema>;
export type AdTrafficPaginationProof = z.infer<typeof AdTrafficPaginationProofSchema>;
export type AdTrafficAccountSummary = z.infer<typeof AdTrafficAccountSummarySchema>;
export type AdTrafficSourceReceiptInput = z.infer<typeof AdTrafficSourceReceiptInputSchema>;
export type AdTrafficSourceDailyReceiptInput = z.infer<
  typeof AdTrafficSourceDailyReceiptInputSchema
>;
export type AdTrafficSourcePeriodReceiptInput = z.infer<
  typeof AdTrafficSourcePeriodReceiptInputSchema
>;
export type AdTrafficSourceReceipt = z.infer<typeof AdTrafficSourceReceiptSchema>;
export type AdTrafficSourceAttempt = z.infer<typeof AdTrafficSourceAttemptSchema>;
export type AdTrafficSourceControl = z.infer<typeof AdTrafficSourceControlSchema>;
export type AdTrafficSourceStatus = z.infer<typeof AdTrafficSourceStatusSchema>;
export type AdTrafficSourceAccountDaily = z.infer<typeof AdTrafficSourceAccountDailySchema>;
export type AdTrafficSourceOptionDaily = z.infer<typeof AdTrafficSourceOptionDailySchema>;
export type AdTrafficSourceCoverage = z.infer<typeof AdTrafficSourceCoverageSchema>;
export type AdTrafficSourceReconciliation = z.infer<typeof AdTrafficSourceReconciliationSchema>;
export type AdTrafficSourceDailyPublished = z.infer<typeof AdTrafficSourceDailyPublishedSchema>;
export type AdTrafficSourcePublished = z.infer<typeof AdTrafficSourcePublishedSchema>;

/**
 * Which producer wrote the traffic values on a channel daily fact.
 *
 * Listing-level Wing projections are additive for views/cart adds/orders/sold
 * units/GMV, but their visitor values are not account unique visitors. CSV
 * uploads remain an explicit, independent listing-fact source.
 *
 * This names the writer and nothing else. Whether the row is a measurement at
 * all is the row's own `trafficObservedAt`: a day the source reported carries
 * the moment it was observed, and a day it never reported carries nothing.
 */
export type DailyTrafficFactSource = 'wing' | 'csv_upload';

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function dailyTrafficFactSource(metaJson: unknown): DailyTrafficFactSource | null {
  const root = record(metaJson);
  if (!root) return null;
  const marker = root['traffic.currentSource'];
  if (marker === 'traffic.csv_upload') return 'csv_upload';
  if (marker === 'wing.traffic') return 'wing';
  if (marker !== undefined) return null;
  // Rows written before the active-writer marker carry one namespace.
  const wing = record(root['wing.traffic']) !== null || root.source === 'wing.traffic';
  const csv = record(root['traffic.csv_upload']) !== null;
  if (wing && csv) return null;
  return wing ? 'wing' : csv ? 'csv_upload' : null;
}
