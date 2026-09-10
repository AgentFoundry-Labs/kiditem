import { z } from 'zod';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Expected a valid calendar date.');
const jsonObject = z.record(z.string(), z.unknown());

const AdAccountDailyKpiObservedMetricsSchema = z
  .object({
    adSpend: z.boolean(),
    adRevenue: z.boolean(),
    impressions: z.boolean(),
    clicks: z.boolean(),
    conversions: z.boolean(),
    orders: z.boolean(),
  })
  .strict();

/** The row shape produced by the extension's existing daily ads collector. */
export const AdAccountDailyKpiRowSchema = z
  .object({
    date,
    adSpend: z.number().finite(),
    adRevenue: z.number().finite(),
    impressions: z.number().finite(),
    clicks: z.number().finite(),
    conversions: z.number().finite(),
    orders: z.number().finite(),
    roas: z.number().finite().nullable(),
    ctr: z.number().finite().nullable(),
    conversionRate: z.number().finite().nullable(),
    /** Evidence that each additive value was observed or explicitly zero. */
    observedMetrics: AdAccountDailyKpiObservedMetricsSchema,
    rowCount: z.number().int().nonnegative(),
  })
  .strict();

/** The immutable normalized object stored in ChannelScrapeSnapshot. */
export const AdAccountDailyKpiNormalizedSchema = z
  .object({
    adSpend: z.number().finite().int(),
    adRevenue: z.number().finite().int(),
    impressions: z.number().finite().int(),
    clicks: z.number().finite().int(),
    // `conversions` is Coupang's attributed selling-unit count
    // (`adAttributedUnits` / `광고 전환 판매수`). Consumers that need an
    // order count use the separate `orders` field (`adAttributedOrders`).
    conversions: z.number().finite().int(),
    orders: z.number().finite().int(),
    providerRoas: z.number().finite().nullable(),
    providerCtr: z.number().finite().nullable(),
    providerConversionRate: z.number().finite().nullable(),
    /** Preserved source evidence for additive metric availability. */
    observedMetrics: AdAccountDailyKpiObservedMetricsSchema.optional(),
  })
  .strict();

export const AdAccountDailyKpiSourceBeginSchema = z
  .object({
    targetDate: date.optional(),
  })
  .strict();

export const AdAccountDailyKpiSourceReceiptInputSchema = z
  .object({
    businessDate: date,
    observedAt: z.string().datetime({ offset: true }),
    providerAdvertiserId: z.string().trim().min(1).optional(),
    rawJson: jsonObject,
    normalized: AdAccountDailyKpiRowSchema,
  })
  .strict();

export const AdAccountDailyKpiLegacyNormalizedSchema = z
  .object({
    date,
    adSpend: z.number().finite(),
    adRevenue: z.number().finite(),
    impressions: z.number().finite(),
    clicks: z.number().finite(),
    conversions: z.number().finite(),
    orders: z.number().finite(),
    roas: z.number().finite().nullable(),
    ctr: z.number().finite().nullable(),
    conversionRate: z.number().finite().nullable(),
    rowCount: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Compatibility shape for receipts accepted by parser v1 before additive
 * metric evidence was added to the wire contract. It intentionally carries
 * no observedMetrics claim: old evidence remains availability-unknown rather
 * than being upgraded to proof during replay/resume.
 */
export const AdAccountDailyKpiLegacySourceReceiptInputSchema = z
  .object({
    businessDate: date,
    observedAt: z.string().datetime({ offset: true }),
    providerAdvertiserId: z.string().trim().min(1).optional(),
    rawJson: jsonObject,
    normalized: AdAccountDailyKpiLegacyNormalizedSchema,
  })
  .strict();

/** Incoming controller compatibility union; plan parserVersion selects policy. */
export const AdAccountDailyKpiSourceReceiptWireSchema = z.union([
  AdAccountDailyKpiSourceReceiptInputSchema,
  AdAccountDailyKpiLegacySourceReceiptInputSchema,
]);

export const AdAccountDailyKpiSourceReceiptSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    businessDate: date,
    observedAt: z.string().datetime({ offset: true }),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    rowCount: z.number().int().nonnegative(),
    snapshotId: z.string().uuid(),
  })
  .strict();

export const AdAccountDailyKpiSourcePlanSchema = z
  .object({
    sourceType: z.literal('coupang_ads_daily'),
    parserVersion: z.string().min(1),
    channelAccountId: z.string().uuid(),
    expectedAdvertiserId: z.string().min(1),
    coverageRangeStartDate: date,
    coverageRangeEndDate: date,
    expectedDates: z.array(date).min(1),
    businessDates: z.array(date).min(1),
  })
  .strict();

export const AdAccountDailyKpiSourceAttemptSchema = z
  .object({
    attemptId: z.string().uuid(),
    sourceImportRunId: z.string().uuid(),
    channelAccountId: z.string().uuid(),
    state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
    plan: AdAccountDailyKpiSourcePlanSchema,
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    actualCutoffAt: z.string().datetime({ offset: true }).nullable(),
    receiptCount: z.number().int().nonnegative(),
    rowCount: z.number().int().nonnegative(),
    manifestChecksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
  })
  .strict();

export const AdAccountDailyKpiSourceControlSchema = AdAccountDailyKpiSourceAttemptSchema
  .extend({
    attemptToken: z.string().uuid(),
    receipts: z.array(AdAccountDailyKpiSourceReceiptSchema),
  })
  .strict();

export const AdAccountDailyKpiSourceCompleteSchema = z
  .object({ manifestChecksum: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();

export const AdAccountDailyKpiSourceFailSchema = z
  .object({
    code: z.string().trim().min(1).max(80),
    message: z.string().trim().min(1).max(300),
  })
  .strict();

export const AdAccountDailyKpiPublishedRowSchema = z
  .object({
    businessDate: date,
    observedAt: z.string().datetime({ offset: true }),
    normalized: AdAccountDailyKpiNormalizedSchema,
  })
  .strict();

export const AdAccountDailyKpiSourceStatusSchema = z
  .object({
    channelAccountId: z.string().uuid().nullable(),
    status: z.enum(['READY', 'STALE', 'MISSING']),
    refreshing: z.boolean(),
    latestAttempt: AdAccountDailyKpiSourceAttemptSchema.nullable(),
    latestComplete: AdAccountDailyKpiSourceAttemptSchema.nullable(),
    actualCutoffAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

/**
 * How the published account-daily row set should be read as advertising
 * evidence. It reuses the words ABC already consumes so a consumer never has
 * to infer intent from an empty array.
 *
 * - `OBSERVED` — an advertising account exists and at least one published row
 *   carries non-zero ad spend.
 * - `CONFIRMED_ZERO` — an advertising account exists and every published row
 *   is an explicit zero. The collector emits a complete all-zero row for a day
 *   whose ad report is empty, so this is proof of no spend.
 * - `MISSING` — an advertising account exists but published no complete row in
 *   the requested range. This is absent evidence, never an ad cost of zero.
 * - `NOT_APPLIED` — the organization has no active advertising account, so no
 *   collection can exist and advertising does not apply to the period.
 *
 * The word describes the returned rows only. It does not claim the rows cover
 * every date the caller asked for; range coverage and collection freshness
 * stay with `AdAccountDailyKpiSourceStatusSchema`.
 */
export const AdAccountDailyKpiPublishedEvidenceSchema = z.enum([
  'OBSERVED',
  'CONFIRMED_ZERO',
  'MISSING',
  'NOT_APPLIED',
]);

export const AdAccountDailyKpiPublishedSchema = z
  .object({
    /** `null` only when `evidence` is `NOT_APPLIED`. */
    channelAccountId: z.string().uuid().nullable(),
    evidence: AdAccountDailyKpiPublishedEvidenceSchema,
    rows: z.array(AdAccountDailyKpiPublishedRowSchema),
  })
  .strict();

export type AdAccountDailyKpiRow = z.infer<typeof AdAccountDailyKpiRowSchema>;
export type AdAccountDailyKpiNormalized = z.infer<typeof AdAccountDailyKpiNormalizedSchema>;
export type AdAccountDailyKpiSourceBegin = z.infer<typeof AdAccountDailyKpiSourceBeginSchema>;
export type AdAccountDailyKpiSourceReceiptInput =
  | z.infer<typeof AdAccountDailyKpiSourceReceiptInputSchema>
  | z.infer<typeof AdAccountDailyKpiLegacySourceReceiptInputSchema>;
export type AdAccountDailyKpiSourceReceipt = z.infer<typeof AdAccountDailyKpiSourceReceiptSchema>;
export type AdAccountDailyKpiSourcePlan = z.infer<typeof AdAccountDailyKpiSourcePlanSchema>;
export type AdAccountDailyKpiSourceAttempt = z.infer<typeof AdAccountDailyKpiSourceAttemptSchema>;
export type AdAccountDailyKpiSourceControl = z.infer<typeof AdAccountDailyKpiSourceControlSchema>;
export type AdAccountDailyKpiSourceComplete = z.infer<typeof AdAccountDailyKpiSourceCompleteSchema>;
export type AdAccountDailyKpiSourceFail = z.infer<typeof AdAccountDailyKpiSourceFailSchema>;
export type AdAccountDailyKpiPublishedRow = z.infer<typeof AdAccountDailyKpiPublishedRowSchema>;
export type AdAccountDailyKpiSourceStatus = z.infer<typeof AdAccountDailyKpiSourceStatusSchema>;
export type AdAccountDailyKpiPublishedEvidence =
  z.infer<typeof AdAccountDailyKpiPublishedEvidenceSchema>;
export type AdAccountDailyKpiPublished = z.infer<typeof AdAccountDailyKpiPublishedSchema>;
