import { z } from 'zod';
import { zIsoDate } from './common';
import { AdKeywordGroupPlanSchema, AdKeywordGroupResultSchema } from './ad-keyword-source';

const timestamp = zIsoDate
  .transform((v) => (v instanceof Date ? v.toISOString() : v))
  .pipe(z.string().datetime({ offset: true }));
const id = z.string().min(1);
const providerId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .refine((value) => Number.isSafeInteger(Number(value)), 'provider id must be a safe decimal integer');
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().date();
const sweepBegin = z
  .object({ channelAccountId: z.string().uuid().optional() })
  .strict();
const manualReportBegin = z
  .object({
    captureMode: z.literal('manual_report'),
    channelAccountId: z.string().uuid().optional(),
    period: z.enum(['7d', '1d']),
    startDate: date,
    endDate: date,
    targetUrl: z.string().url().max(2_048),
  })
  .strict();
export const AdCampaignSourceBeginSchema = z.union([manualReportBegin, sweepBegin]);
const planBase = {
  sourceType: z.literal('coupang_ad_campaign'),
  parserVersion: z.literal('ad-campaign-v1'),
  channelAccountId: z.string().uuid(),
  expectedAdvertiserId: id,
  startDate: date,
  endDate: date,
};
export const AdCampaignSourcePlanSchema = z.union([
  z
    .object({
      ...planBase,
      captureMode: z.literal('manual_report'),
      period: z.enum(['7d', '1d']),
      targetUrl: z.string().url().max(2_048),
      businessDates: z.array(date).length(1),
    })
    .strict(),
  z
    .object({
      ...planBase,
      captureMode: z.literal('campaign_sweep').default('campaign_sweep'),
      businessDates: z.array(date).length(31),
    })
    .strict(),
]);
export const AdCampaignDescriptorSchema = z
  .object({
    key: id,
    name: z.string(),
    campaignId: id.nullable(),
    identity: id.nullable(),
    href: z.string().nullable(),
    hasDetailHref: z.boolean().nullable(),
    onOff: z.string().nullable(),
    status: z.string().nullable(),
    rowIndex: z.number().int().nonnegative(),
  })
  .strict();
export const AdCampaignPayloadSchema = z
  .object({
    data: z.array(z.record(z.string(), z.unknown())),
    normalizedRows: z.array(z.record(z.string(), z.unknown())),
    campaignName: z.string(),
    campaignReportScope: z.string().optional(),
    dashboardOnOff: z.string().nullable().optional(),
    dashboardStatus: z.string().nullable().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    timestamp: timestamp,
    url: z.string().optional(),
  })
  .passthrough();
const common = { key: id, advertiserId: id.nullable(), capturedAt: timestamp };
const dashboard = z
  .object({
    ...common,
    kind: z.literal('dashboard_page'),
    pageIndex: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
    verified: z.boolean(),
    explicitEmpty: z.boolean(),
    campaigns: z.array(AdCampaignDescriptorSchema),
  })
  .strict();
const campaign = z
  .object({
    ...common,
    kind: z.literal('campaign'),
    campaignKey: id,
    campaignId: id.nullable(),
    mode: z.enum(['daily', 'metadata', 'raw_only']),
    payload: AdCampaignPayloadSchema.optional(),
  })
  .strict();
const campaignDayDomProof = z
  .object({
    dateApplied: z.boolean(),
    complete: z.boolean(),
    explicitEmpty: z.boolean(),
    expectedPages: z.number().int().nonnegative(),
    visitedPages: z.array(z.number().int().positive()),
  })
  .strict();
const campaignDayProductSalesApiProof = z
  .object({
    kind: z.literal('product_sales_api'),
    campaignId: providerId,
    adGroupId: providerId,
    businessDate: date,
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    tableType: z.literal('product_sales'),
    creativeId: z.null(),
    isMatchTypeEnabled: z.literal(false),
    expectedGroupIds: z.array(providerId).length(1),
    totalAdCount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    expectedAds: z
      .array(z.object({ adId: providerId, vendorItemId: providerId }).strict())
      .min(1),
    observedAdIds: z.array(providerId),
    complete: z.boolean(),
    explicitEmpty: z.boolean(),
  })
  .strict();
const day = z
  .object({
    ...common,
    kind: z.literal('campaign_day'),
    campaignKey: id,
    businessDate: z.string().date(),
    payload: AdCampaignPayloadSchema,
    proof: z.union([campaignDayDomProof, campaignDayProductSalesApiProof]),
  })
  .strict();
const keywords = z
  .object({
    ...common,
    kind: z.literal('auxiliary_keywords'),
    campaignKey: id,
    adGroupId: id,
    groupPlan: AdKeywordGroupPlanSchema,
    groupResult: AdKeywordGroupResultSchema,
  })
  .strict();
const manualReport = z
  .object({
    ...common,
    kind: z.literal('manual_report'),
    period: z.enum(['7d', '1d']),
    startDate: date,
    endDate: date,
    payload: AdCampaignPayloadSchema,
  })
  .strict();
export const AdCampaignSourceReceiptInputSchema = z.discriminatedUnion('kind', [
  dashboard,
  campaign,
  day,
  keywords,
  manualReport,
]);
export const AdCampaignSourceReceiptSchema = z.object({
  sequence: z.number().int().nonnegative(),
  key: id,
  kind: z.enum(['dashboard_page', 'campaign', 'campaign_day', 'auxiliary_keywords', 'manual_report']),
  checksum,
  campaignKey: id.optional(),
  businessDate: z.string().date().optional(),
  mode: z.enum(['daily', 'metadata', 'raw_only']).optional(),
  period: z.enum(['7d', '1d']).optional(),
  startDate: date.optional(),
  endDate: date.optional(),
});
export const AdCampaignSourceAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  plan: AdCampaignSourcePlanSchema,
  expiresAt: timestamp,
  actualCutoffAt: timestamp.nullable(),
  manifestChecksum: checksum,
  rowCount: z.number().int().nonnegative(),
  campaignCount: z.number().int().nonnegative(),
  rawOnlyCampaignCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
export const AdCampaignSourceReceiptAckSchema = AdCampaignSourceAttemptSchema.extend({
  receipt: AdCampaignSourceReceiptSchema.nullable(),
});
export const AdCampaignSourceControlSchema = AdCampaignSourceAttemptSchema.extend({
  attemptToken: z.string().uuid(),
  receipts: z.array(AdCampaignSourceReceiptSchema),
  pages: z.array(dashboard),
  campaigns: z.array(campaign.omit({ payload: true })),
});
export const AdCampaignSourceStatusSchema = z.object({
  channelAccountId: z.string().uuid().nullable(),
  ready: z.boolean(),
  /** Readiness and these two fields describe the 31-day campaign sweep only. */
  latestAttempt: AdCampaignSourceAttemptSchema.nullable(),
  latestComplete: AdCampaignSourceAttemptSchema.nullable(),
  actualCutoffAt: timestamp.nullable(),
  /** The account's live attempt of any capture mode: RUNNING with its lease not passed. */
  activeAttempt: AdCampaignSourceAttemptSchema.nullable().default(null),
  /** The newest `manual_report` attempt in any state. */
  latestManualReport: AdCampaignSourceAttemptSchema.nullable().default(null),
});
const AdCampaignManualReportPlanSchema = z
  .object({
    sourceType: z.literal('coupang_ad_campaign'),
    parserVersion: z.literal('ad-campaign-v1'),
    captureMode: z.literal('manual_report'),
    period: z.enum(['7d', '1d']),
    channelAccountId: z.string().uuid(),
    expectedAdvertiserId: id,
    startDate: date,
    endDate: date,
    targetUrl: z.string().url().max(2_048),
    businessDates: z.array(date).length(1),
  })
  .strict();
export const AdCampaignManualReportSchema = z
  .object({
    attemptId: z.string().uuid(),
    generation: z.string(),
    plan: AdCampaignManualReportPlanSchema,
    payload: AdCampaignPayloadSchema,
  })
  .strict();
export const AdCampaignManualReportsSchema = z
  .object({
    channelAccountId: z.string().uuid(),
    reports: z.array(AdCampaignManualReportSchema),
  })
  .strict();
export const AdCampaignSourceCompleteSchema = z.object({ manifestChecksum: checksum }).strict();
export const AdCampaignSourceFailureSchema = z
  .object({ code: id.max(100), message: id.max(300) })
  .strict();
export type AdCampaignSourceBegin = z.infer<typeof AdCampaignSourceBeginSchema>;
export type AdCampaignSourcePlan = z.infer<typeof AdCampaignSourcePlanSchema>;
export type AdCampaignSourceAttempt = z.infer<typeof AdCampaignSourceAttemptSchema>;
export type AdCampaignSourceControl = z.infer<typeof AdCampaignSourceControlSchema>;
export type AdCampaignSourceStatus = z.infer<typeof AdCampaignSourceStatusSchema>;
export type AdCampaignSourceReceiptInput = z.infer<typeof AdCampaignSourceReceiptInputSchema>;
export type AdCampaignSourceReceipt = z.infer<typeof AdCampaignSourceReceiptSchema>;
export type AdCampaignPayload = z.infer<typeof AdCampaignPayloadSchema>;
export type AdCampaignManualReport = z.infer<typeof AdCampaignManualReportSchema>;
export type AdCampaignManualReports = z.infer<typeof AdCampaignManualReportsSchema>;
