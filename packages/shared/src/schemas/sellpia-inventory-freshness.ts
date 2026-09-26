import { z } from 'zod';

/**
 * The inventory read describes collection state. A completed snapshot stays
 * usable until a newer collection publishes it; time never changes this
 * status.
 */
export const SELLPIA_INVENTORY_COLLECTION_STATUSES = [
  'not_collected',
  'running',
  'complete',
  'failed',
] as const;

/**
 * Triggers are source-owner facts, rather than freshness policy decisions.
 * `ttl_expired` and `purchase_preflight` intentionally have no public form.
 * The historical values are retained only for rows already persisted by an
 * older source owner.
 */
export const SELLPIA_INVENTORY_COLLECTION_TRIGGERS = [
  'initial_snapshot',
  'order_transmission_requested',
  'same_hash_confirmation',
  'manual_request',
  'retry',
  'legacy_manual_import',
] as const;

/** Values that may still exist in persisted state during the cutover. */
export const SELLPIA_INVENTORY_STORED_COLLECTION_TRIGGERS = [
  ...SELLPIA_INVENTORY_COLLECTION_TRIGGERS,
  'ttl_expired',
  'purchase_preflight',
] as const;

export const SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES = [
  'sellpia_login_required',
  'sellpia_download_contract_drift',
  'sellpia_invalid_workbook',
  'sellpia_background_timeout',
  'sellpia_network_failed',
] as const;

export const SellpiaInventoryCollectionStatusSchema = z.enum(
  SELLPIA_INVENTORY_COLLECTION_STATUSES,
);
export const SellpiaInventoryCollectionTriggerSchema = z.enum(
  SELLPIA_INVENTORY_COLLECTION_TRIGGERS,
);
export const SellpiaInventoryStoredCollectionTriggerSchema = z.enum(
  SELLPIA_INVENTORY_STORED_COLLECTION_TRIGGERS,
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
    /** The source attempt holding the collection lease. */
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
    /**
     * 이 시도가 어느 셀피아 kind의 실행인가(재고·매출·상품 손익 — 셀피아 로그인 하나를 나눠 쓴다, KID-355). 옛
     * 응답에는 없어 null로 읽는다.
     */
    kind: z.string().max(128).nullable().default(null),
    attemptedAt: IsoDateTimeStringSchema,
    trigger: SellpiaInventoryCollectionTriggerSchema.nullable(),
    scope: SellpiaSyncScopeSchema,
    errorCode: z.string().max(100).nullable(),
    errorMessage: z.string().max(300).nullable(),
  })
  .strict();

/** Public organization-scoped collection state. */
export const SellpiaInventoryCollectionStatusViewSchema = z
  .object({
    status: SellpiaInventoryCollectionStatusSchema,
    sourceBinding: SellpiaInventorySourceBindingViewSchema,
    requestedGeneration: SellpiaInventoryGenerationSchema,
    verifiedGeneration: SellpiaInventoryGenerationSchema,
    lastCompletedAttemptId: z.string().uuid().nullable(),
    lastCompletedAt: IsoDateTimeStringSchema.nullable(),
    lastAttemptId: z.string().uuid().nullable(),
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

export type SellpiaInventoryCollectionStatus = z.infer<
  typeof SellpiaInventoryCollectionStatusSchema
>;
export type SellpiaInventoryCollectionTrigger = z.infer<
  typeof SellpiaInventoryCollectionTriggerSchema
>;
export type SellpiaInventoryStoredCollectionTrigger = z.infer<
  typeof SellpiaInventoryStoredCollectionTriggerSchema
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
export type SellpiaInventoryCollectionStatusView = z.infer<
  typeof SellpiaInventoryCollectionStatusViewSchema
>;
export type SellpiaInventorySourceBindingRequest = z.infer<
  typeof SellpiaInventorySourceBindingRequestSchema
>;

/**
 * A stopped attempt leaves the previous completed snapshot in use. The owner
 * publishes a last attempt without error facts for that case; this predicate
 * keeps cancellation distinct from a collection failure.
 */
export function isSellpiaInventoryCollectionStopped(
  view: Pick<SellpiaInventoryCollectionStatusView, 'status' | 'lastCompletedAt' | 'lastAttempt'>,
): boolean {
  const attempt = view.lastAttempt;
  if (attempt === null || view.status === 'running' || view.status === 'failed') return false;
  if (attempt.errorCode !== null || attempt.errorMessage !== null) return false;
  return view.lastCompletedAt === null
    || Date.parse(attempt.attemptedAt) > Date.parse(view.lastCompletedAt);
}
