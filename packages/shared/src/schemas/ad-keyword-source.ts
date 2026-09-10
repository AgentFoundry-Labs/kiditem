import { z } from 'zod';
import { zIsoDate } from './common';

const timestamp = zIsoDate
  .transform((value) => (value instanceof Date ? value.toISOString() : value))
  .pipe(z.string().datetime({ offset: true }));

const id = z.string().trim().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
export const AdKeywordSourceBeginSchema = z
  .object({ channelAccountId: z.string().uuid().optional() })
  .strict();
export type AdKeywordSourceBegin = z.infer<typeof AdKeywordSourceBeginSchema>;
export const AdKeywordSourcePlanSchema = z
  .object({
    sourceType: z.literal('coupang_ad_keyword'),
    parserVersion: z.literal('ad-keyword-v1'),
    channelAccountId: z.string().uuid(),
    expectedAdvertiserId: id,
    startDate: z.string().date(),
    endDate: z.string().date(),
    windowDays: z.literal(7),
  })
  .strict();
export type AdKeywordSourcePlan = z.infer<typeof AdKeywordSourcePlanSchema>;
export const AdKeywordRosterSchema = z
  .object({
    advertiserId: id.nullable(),
    campaigns: z
      .array(
        z
          .object({
            campaignId: id,
            name: z.string(),
            isActive: z.boolean(),
            totalAdCount: z.number().int().nonnegative(),
            groupsArrayObserved: z.boolean(),
            groups: z.array(
              z.object({ adGroupId: id, adGroupName: z.string().nullable() }).strict(),
            ),
          })
          .strict(),
      )
      .max(1000),
    pages: z
      .array(
        z
          .object({
            page: z.number().int().min(0).max(19),
            campaignsArrayObserved: z.boolean(),
            hasNextPage: z.boolean().nullable(),
            campaignCount: z.number().int().min(0).max(50),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export type AdKeywordRoster = z.infer<typeof AdKeywordRosterSchema>;
export const AdKeywordGroupPlanSchema = z
  .object({
    advertiserId: id.nullable(),
    adsArrayObserved: z.boolean(),
    adGroupName: z.string().nullable(),
    enumeratedAdCount: z.number().int().nonnegative(),
    ads: z
      .array(
        z
          .object({ adId: id, vendorItemId: id, itemName: z.string(), isActive: z.boolean() })
          .strict(),
      )
      .max(60),
  })
  .strict();
export type AdKeywordGroupPlan = z.infer<typeof AdKeywordGroupPlanSchema>;
export const AdKeywordGroupResultSchema = z
  .object({
    advertiserId: id.nullable(),
    capturedAt: timestamp,
    ads: z
      .array(z.object({ adId: id, metricsOk: z.boolean(), registeredOk: z.boolean() }).strict())
      .max(60),
    rows: z.array(z.record(z.string(), z.unknown())),
  })
  .strict();
export type AdKeywordGroupResult = z.infer<typeof AdKeywordGroupResultSchema>;
export const AdKeywordSourceCompleteSchema = z.object({ manifestChecksum: checksum }).strict();
export const AdKeywordSourceFailureSchema = z
  .object({ code: z.string().trim().min(1).max(100), message: z.string().trim().min(1).max(300) })
  .strict();
export const AdKeywordReceiptSchema = z.object({
  kind: z.enum(['roster', 'group_plan', 'group_result']),
  sequence: z.number().int().nonnegative(),
  checksum,
  itemCount: z.number().int().nonnegative(),
});
export const AdKeywordQueueUnitSchema = z.object({
  key: id,
  campaignId: id,
  campaignName: z.string(),
  campaignIdentity: id,
  adGroupId: id,
  adGroupName: z.string().nullable(),
  isActive: z.boolean(),
  totalAdCount: z.number().int().nonnegative(),
});
export type AdKeywordQueueUnit = z.infer<typeof AdKeywordQueueUnitSchema>;
export const AdKeywordSourceAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  plan: AdKeywordSourcePlanSchema,
  expiresAt: timestamp,
  actualCutoffAt: timestamp.nullable(),
  manifestChecksum: checksum,
  rowCount: z.number().int().nonnegative(),
  groupCount: z.number().int().nonnegative(),
  completedGroupCount: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
export type AdKeywordSourceAttempt = z.infer<typeof AdKeywordSourceAttemptSchema>;
export const AdKeywordSourceControlSchema = AdKeywordSourceAttemptSchema.extend({
  attemptToken: z.string().uuid(),
  roster: AdKeywordRosterSchema.nullable(),
  receipts: z.array(AdKeywordReceiptSchema),
  queue: z.array(
    AdKeywordQueueUnitSchema.extend({
      sequence: z.number().int().nonnegative(),
      plan: AdKeywordGroupPlanSchema.nullable(),
      resultComplete: z.boolean(),
    }),
  ),
});
export type AdKeywordSourceControl = z.infer<typeof AdKeywordSourceControlSchema>;
export const AdKeywordSourceStatusSchema = z.object({
  channelAccountId: z.string().uuid().nullable(),
  status: z.enum(['READY', 'STALE', 'MISSING']),
  refreshing: z.boolean(),
  latestAttempt: AdKeywordSourceAttemptSchema.nullable(),
  latestComplete: AdKeywordSourceAttemptSchema.nullable(),
  actualCutoffAt: timestamp.nullable(),
});
export type AdKeywordSourceStatus = z.infer<typeof AdKeywordSourceStatusSchema>;
