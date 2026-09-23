import { z } from 'zod';
import { zIsoDate } from './common.js';
import { SalesProductSchema } from './sales-product.js';

export const TargetExecutionKindSchema = z.enum(['register', 'update', 'sold_out', 'resume', 'composition_change']);
const OptionTransitionSchema = z.object({
  channelListingOptionId: z.string().uuid(),
  salesProductOptionId: z.string().uuid(),
}).strict();
export const PrepareTargetExecutionInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  kind: TargetExecutionKindSchema,
  idempotencyKey: z.string().trim().min(1).max(200),
  channelListingId: z.string().uuid().optional(),
  /** Supported price update sends only this field, never the whole registration form. */
  updateFields: z.array(z.literal('salePrice')).length(1).optional(),
  /** Execution-only provider defaults; target settings remain authoritative overrides. */
  adapterDefaults: z.record(z.string(), z.string()).optional(),
  /** Explicit values edited for this submission only; never writes reusable settings. */
  adapterValues: z.record(z.string(), z.string()).optional(),
  applyCompositionTemplate: z.boolean().default(false),
  /** Explicit old marketplace option → new common option; never match by order/name. */
  optionTransitions: z.array(OptionTransitionSchema).max(1000).optional(),
}).strict();
export type PrepareTargetExecutionInput = z.infer<typeof PrepareTargetExecutionInputSchema>;

export const TargetExecutionSnapshotSchema = z.object({
  targetId: z.string().uuid(),
  targetVersion: z.number().int().positive(),
  channelAccountId: z.string().uuid(),
  kind: TargetExecutionKindSchema,
  channelListingId: z.string().uuid().nullable(),
  updateFields: z.array(z.literal('salePrice')).length(1).optional(),
  /** Execution-only provider defaults; target settings remain authoritative overrides. */
  adapterDefaults: z.record(z.string(), z.string()).optional(),
  /** Explicit values edited for this submission only; never writes reusable settings. */
  adapterValues: z.record(z.string(), z.string()).optional(),
  applyCompositionTemplate: z.boolean(),
  optionTransitions: z.array(OptionTransitionSchema).optional(),
  product: SalesProductSchema,
  /**
   * 이 실행이 몰에 보낼 상세 — 준비 순간 Content 의 revision 을 읽어 동결한다(KID-313 W2). 등록 대상이 고른
   * revision, 없으면 워크스페이스의 현재 revision. 상세가 없으면 null.
   */
  detailPage: z.object({
    revisionId: z.string().uuid(),
    html: z.string(),
    extraHtml: z.array(z.string()),
  }).strict().nullable(),
  /** 등록 대상의 몰 전용 값(`RegistrationMallInputSchema`). */
  registrationInput: z.record(z.string(), z.unknown()),
  /** 옵션 identity 목록. 공급가는 판매 상품에 없어 null 이다(KID-313 W2) — 몰 공급가는 mallFields 가 말한다. */
  supplyPrices: z.array(z.object({ salesProductOptionId: z.string().uuid(), supplyPrice: z.number().int().min(0).max(1_000_000_000).nullable() })),
});
export type TargetExecutionSnapshot = z.infer<typeof TargetExecutionSnapshotSchema>;
export const TargetExecutionResultSchema = z.object({
  executionId: z.string().uuid(), targetId: z.string().uuid(), channelAccountId: z.string().uuid(),
  status: z.enum(['prepared', 'executing', 'reconciling', 'succeeded', 'failed', 'cancelled']),
  providerOutcome: z.enum(['not_attempted', 'uncertain', 'succeeded', 'definitive_failure']),
  payloadHash: z.string(), payload: TargetExecutionSnapshotSchema,
  leaseToken: z.string().uuid().nullable(),
  /** Only the request that atomically starts this execution may perform provider IO. */
  maySubmit: z.boolean(),
  externalListingId: z.string().nullable(),
  expectedProviderAccountId: z.string().nullable().optional(),
  result: z.unknown().nullable(),
  createdAt: zIsoDate.optional(),
});
export type TargetExecutionResult = z.infer<typeof TargetExecutionResultSchema>;
export const ReportTargetExecutionInputSchema = z.object({
  leaseToken: z.string().uuid(), payloadHash: z.string().min(1),
  outcome: z.enum(['not_submitted', 'uncertain', 'submitted', 'awaiting_approval', 'confirmed']),
  evidence: z.object({
    channelAccountId: z.string().uuid(),
    externalListingId: z.string().trim().min(1).optional(),
    observedUrl: z.string().url().optional(),
    providerAccountId: z.string().optional(),
    observedStatus: z.string().optional(),
    message: z.string().optional(),
    options: z.array(z.object({
      salesProductOptionId: z.string().uuid(),
      externalOptionId: z.string().trim().min(1),
      sellerSku: z.string().nullable().optional(),
    }).strict()).optional(),
  }).strict(),
}).strict();
export type ReportTargetExecutionInput = z.infer<typeof ReportTargetExecutionInputSchema>;
