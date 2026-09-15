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
  // Historical persisted/import trigger only; order submission cannot request it.
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
export const SellpiaSyncScopeSchema = z.enum(['full', 'inventory']);

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

const SellpiaInventorySourceBindingViewSchema = z.discriminatedUnion(
  'confirmed',
  [
    z
      .object({
        origin: FixedSellpiaOriginSchema,
        accountKey: z.null(),
        confirmed: z.literal(false),
      })
      .strict(),
    z
      .object({
        origin: FixedSellpiaOriginSchema,
        accountKey: FixedSellpiaAccountKeySchema,
        confirmed: z.literal(true),
      })
      .strict(),
  ],
);

const SellpiaInventoryActiveSyncViewSchema = z
  .object({
    /**
     * The browser source attempt holding the lease, which an operator stops by
     * id from any browser. A manual upload holds the lease without one. The
     * lease token is the attempt's write fence and is never part of the view.
     */
    attemptId: z.string().uuid().nullable(),
    generation: SellpiaInventoryGenerationSchema,
    scope: SellpiaSyncScopeSchema,
    startedAt: IsoDateTimeStringSchema,
    leaseExpiresAt: IsoDateTimeStringSchema,
    canControl: z.boolean(),
  })
  .strict();

const SellpiaInventoryLastAttemptViewSchema = z
  .object({
    attemptedAt: IsoDateTimeStringSchema,
    trigger: SellpiaInventoryRefreshReasonSchema.nullable(),
    scope: SellpiaSyncScopeSchema,
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
    requestedSyncScope: SellpiaSyncScopeSchema,
    syncNotBefore: IsoDateTimeStringSchema.nullable(),
    activeSync: SellpiaInventoryActiveSyncViewSchema.nullable(),
    lastAttempt: SellpiaInventoryLastAttemptViewSchema.nullable(),
  })
  .strict();

export const SellpiaInventorySourceBindingRequestSchema = z
  .object({
    sourceOrigin: FixedSellpiaOriginSchema,
    sourceAccountKey: FixedSellpiaAccountKeySchema,
    confirmed: z.literal(true),
  })
  .strict();

export type SellpiaInventoryFreshnessStatus = z.infer<
  typeof SellpiaInventoryFreshnessStatusSchema
>;
export type SellpiaInventoryRefreshReason = z.infer<
  typeof SellpiaInventoryRefreshReasonSchema
>;
export type SellpiaInventoryCollectionFailureCode = z.infer<
  typeof SellpiaInventoryCollectionFailureCodeSchema
>;
export type SellpiaSyncScope = z.infer<typeof SellpiaSyncScopeSchema>;
export type SellpiaInventoryQualityIssue = z.infer<
  typeof SellpiaInventoryQualityIssueSchema
>;
export type SellpiaInventoryQualityReport = z.infer<
  typeof SellpiaInventoryQualityReportSchema
>;
export type SellpiaInventoryFreshnessView = z.infer<
  typeof SellpiaInventoryFreshnessViewSchema
>;
export type SellpiaInventorySourceBindingRequest = z.infer<
  typeof SellpiaInventorySourceBindingRequestSchema
>;

export type SellpiaFreshnessDerivationInput = {
  now: Date;
  lastVerifiedAt: Date | null;
  requestedGeneration: bigint;
  verifiedGeneration: bigint;
  failedGeneration: bigint | null;
  activeSyncLeaseExpiresAt: Date | null;
  /** @deprecated Transmission reconciliation is independent from stock freshness. */
  hasUnresolvedOrderTransmissionIntent?: boolean;
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

/**
 * Whether the view's last attempt was stopped, derived from the facts the
 * owner publishes. Owner rule: an attempt that ends with neither a verified
 * snapshot nor an error fact is a stop. A completion verifies at the
 * attempt's own instant and a failure keeps an error code or message, so only
 * a stop leaves a last attempt after the verified snapshot without either;
 * the previous snapshot stays in use. A syncing or failed view is never
 * stopped.
 */
export function isSellpiaInventoryLastAttemptStopped(
  view: Pick<SellpiaInventoryFreshnessView, 'status' | 'lastVerifiedAt' | 'lastAttempt'>,
): boolean {
  const attempt = view.lastAttempt;
  if (view.status !== 'refresh_required' || attempt === null) return false;
  if (attempt.errorCode !== null || attempt.errorMessage !== null) return false;
  return view.lastVerifiedAt === null
    || Date.parse(attempt.attemptedAt) > Date.parse(view.lastVerifiedAt);
}
