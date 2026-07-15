import { z } from 'zod';

export const SELLPIA_INVENTORY_FRESHNESS_STATUSES = [
  'fresh',
  'refresh_required',
  'syncing',
  'failed',
] as const;

export const SELLPIA_INVENTORY_REFRESH_REASONS = [
  'initial_snapshot',
  'ttl_expired',
  'order_transmission_requested',
  'same_hash_confirmation',
  'purchase_preflight',
  'manual_request',
  'retry',
  'legacy_manual_import',
] as const;

export const SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES = [
  'sellpia_login_required',
  'sellpia_download_contract_drift',
  'sellpia_invalid_workbook',
  'sellpia_background_timeout',
  'sellpia_network_failed',
] as const;

export const SellpiaInventoryFreshnessStatusSchema = z.enum(
  SELLPIA_INVENTORY_FRESHNESS_STATUSES,
);
export const SellpiaInventoryRefreshReasonSchema = z.enum(
  SELLPIA_INVENTORY_REFRESH_REASONS,
);
export const SellpiaInventoryCollectionFailureCodeSchema = z.enum(
  SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES,
);
export const SellpiaInventoryGenerationSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, 'Generation must be a decimal string');

const IsoDateTimeStringSchema = z.string().datetime({ offset: true });
const FixedSellpiaOriginSchema = z.literal('https://kiditem.sellpia.com');
const FixedSellpiaAccountKeySchema = z.literal('kiditem');

export const SellpiaInventoryQualityIssueSchema = z
  .object({
    code: z.string().trim().min(1).max(100),
    severity: z.enum(['warning', 'error']),
    count: z.number().int().nonnegative(),
    sampleRowNumbers: z.array(z.number().int().positive()).max(10),
    sampleProductCodes: z.array(z.string().trim().min(1).max(100)).max(10),
  })
  .strict();

export const SellpiaInventoryQualityReportSchema = z
  .object({
    issues: z.array(SellpiaInventoryQualityIssueSchema).max(20),
  })
  .strict();

const SellpiaInventorySourceBindingViewSchema = z
  .object({
    origin: FixedSellpiaOriginSchema,
    accountKey: FixedSellpiaAccountKeySchema.nullable(),
    confirmed: z.boolean(),
  })
  .strict();

const SellpiaInventoryActiveSyncViewSchema = z
  .object({
    runId: z.string().uuid(),
    generation: SellpiaInventoryGenerationSchema,
    startedAt: IsoDateTimeStringSchema,
    leaseExpiresAt: IsoDateTimeStringSchema,
    canControl: z.boolean(),
  })
  .strict();

const SellpiaInventoryLastAttemptViewSchema = z
  .object({
    attemptedAt: IsoDateTimeStringSchema,
    status: z.enum(['completed', 'failed']),
    trigger: SellpiaInventoryRefreshReasonSchema.nullable(),
    errorCode: SellpiaInventoryCollectionFailureCodeSchema.nullable(),
    errorMessage: z.string().max(300).nullable(),
  })
  .strict();

export const SellpiaInventoryFreshnessViewSchema = z
  .object({
    status: SellpiaInventoryFreshnessStatusSchema,
    sourceBinding: SellpiaInventorySourceBindingViewSchema,
    lastVerifiedAt: IsoDateTimeStringSchema.nullable(),
    expiresAt: IsoDateTimeStringSchema.nullable(),
    requestedGeneration: SellpiaInventoryGenerationSchema,
    verifiedGeneration: SellpiaInventoryGenerationSchema,
    refreshRequestedAt: IsoDateTimeStringSchema.nullable(),
    refreshReason: SellpiaInventoryRefreshReasonSchema.nullable(),
    syncNotBefore: IsoDateTimeStringSchema.nullable(),
    activeSync: SellpiaInventoryActiveSyncViewSchema.nullable(),
    lastAttempt: SellpiaInventoryLastAttemptViewSchema.nullable(),
  })
  .strict();

export const SellpiaInventoryRefreshRequestSchema = z
  .object({
    reason: z.enum([
      'order_transmission_requested',
      'manual_request',
      'retry',
    ]),
  })
  .strict();

export const SellpiaInventoryClaimRequestSchema = z.object({}).strict();
export const SellpiaInventoryHeartbeatRequestSchema = z.object({}).strict();
export const SellpiaInventoryCancelRequestSchema = z.object({}).strict();

export const SellpiaInventoryFailRequestSchema = z
  .object({
    errorCode: SellpiaInventoryCollectionFailureCodeSchema,
    errorMessage: z.string().trim().min(1).max(300),
  })
  .strict();

export const SellpiaInventorySourceBindingRequestSchema = z
  .object({
    sourceOrigin: FixedSellpiaOriginSchema,
    sourceAccountKey: FixedSellpiaAccountKeySchema,
    confirmed: z.literal(true),
  })
  .strict();

export const SellpiaInventoryClaimResponseSchema = z.discriminatedUnion(
  'claimed',
  [
    z
      .object({
        claimed: z.literal(false),
        state: SellpiaInventoryFreshnessViewSchema,
      })
      .strict(),
    z
      .object({
        claimed: z.literal(true),
        claimToken: z.string().uuid(),
        activeGeneration: SellpiaInventoryGenerationSchema,
        leaseExpiresAt: IsoDateTimeStringSchema,
        state: SellpiaInventoryFreshnessViewSchema,
      })
      .strict(),
  ],
);

export type SellpiaInventoryFreshnessStatus = z.infer<
  typeof SellpiaInventoryFreshnessStatusSchema
>;
export type SellpiaInventoryRefreshReason = z.infer<
  typeof SellpiaInventoryRefreshReasonSchema
>;
export type SellpiaInventoryCollectionFailureCode = z.infer<
  typeof SellpiaInventoryCollectionFailureCodeSchema
>;
export type SellpiaInventoryQualityIssue = z.infer<
  typeof SellpiaInventoryQualityIssueSchema
>;
export type SellpiaInventoryQualityReport = z.infer<
  typeof SellpiaInventoryQualityReportSchema
>;
export type SellpiaInventoryFreshnessView = z.infer<
  typeof SellpiaInventoryFreshnessViewSchema
>;
export type SellpiaInventoryRefreshRequest = z.infer<
  typeof SellpiaInventoryRefreshRequestSchema
>;
export type SellpiaInventoryClaimRequest = z.infer<
  typeof SellpiaInventoryClaimRequestSchema
>;
export type SellpiaInventoryHeartbeatRequest = z.infer<
  typeof SellpiaInventoryHeartbeatRequestSchema
>;
export type SellpiaInventoryFailRequest = z.infer<
  typeof SellpiaInventoryFailRequestSchema
>;
export type SellpiaInventoryCancelRequest = z.infer<
  typeof SellpiaInventoryCancelRequestSchema
>;
export type SellpiaInventorySourceBindingRequest = z.infer<
  typeof SellpiaInventorySourceBindingRequestSchema
>;
export type SellpiaInventoryClaimResponse = z.infer<
  typeof SellpiaInventoryClaimResponseSchema
>;

export type SellpiaFreshnessDerivationInput = {
  now: Date;
  lastVerifiedAt: Date | null;
  requestedGeneration: bigint;
  verifiedGeneration: bigint;
  failedGeneration: bigint | null;
  activeSyncLeaseExpiresAt: Date | null;
};

export function deriveSellpiaInventoryFreshness(
  input: SellpiaFreshnessDerivationInput,
): SellpiaInventoryFreshnessStatus {
  if (
    input.activeSyncLeaseExpiresAt &&
    input.activeSyncLeaseExpiresAt > input.now
  ) return 'syncing';
  if (
    input.failedGeneration === input.requestedGeneration &&
    input.failedGeneration > input.verifiedGeneration
  ) return 'failed';
  if (!input.lastVerifiedAt) return 'refresh_required';
  if (input.requestedGeneration > input.verifiedGeneration) {
    return 'refresh_required';
  }
  return input.now.getTime() - input.lastVerifiedAt.getTime() < 10 * 60_000
    ? 'fresh'
    : 'refresh_required';
}
