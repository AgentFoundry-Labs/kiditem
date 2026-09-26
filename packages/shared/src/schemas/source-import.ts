import { z } from 'zod';
import { zIsoDate } from './common.js';
import {
  SellpiaInventoryCollectionFailureCodeSchema,
  SellpiaInventoryGenerationSchema,
  SellpiaInventoryQualityReportSchema,
  SellpiaInventoryStoredCollectionTriggerSchema,
} from './sellpia-inventory-freshness.js';

export const MAX_SELLPIA_INVENTORY_BROWSER_SNAPSHOT_ROWS = 20_000;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

export const SellpiaInventoryBrowserSnapshotRowSchema = z.object({
  productCode: z.string().trim().min(1).max(100),
  optionCode: z.string().trim().max(100),
  name: z.string().trim().max(500),
  optionName: z.string().trim().min(1).max(500).nullable(),
  barcode: z.string().trim().min(1).max(100).nullable(),
  currentStock: z.number().int().min(0).max(POSTGRES_INTEGER_MAX),
  purchasePrice: z.number().int().min(0).max(POSTGRES_INTEGER_MAX).nullable(),
  salePrice: z.number().int().min(0).max(POSTGRES_INTEGER_MAX).nullable(),
}).strict();
export type SellpiaInventoryBrowserSnapshotRow = z.infer<
  typeof SellpiaInventoryBrowserSnapshotRowSchema
>;

export const SellpiaInventoryBrowserSnapshotSchema = z.object({
  source: z.literal('sellpia_product_search'),
  version: z.literal(1),
  rowCount: z.number().int().min(0).max(MAX_SELLPIA_INVENTORY_BROWSER_SNAPSHOT_ROWS),
  rows: z.array(SellpiaInventoryBrowserSnapshotRowSchema)
    .max(MAX_SELLPIA_INVENTORY_BROWSER_SNAPSHOT_ROWS),
}).strict().superRefine((snapshot, ctx) => {
  if (snapshot.rowCount !== snapshot.rows.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rowCount'],
      message: 'Sellpia snapshot rowCount must match rows length',
    });
  }

  let previousIdentity: string | null = null;
  for (let index = 0; index < snapshot.rows.length; index += 1) {
    const row = snapshot.rows[index];
    if (!row) continue;
    const identity = `${row.productCode}-${row.optionCode}`;
    if (previousIdentity !== null && identity <= previousIdentity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rows', index],
        message: identity === previousIdentity
          ? 'Sellpia snapshot contains a duplicate product-option identity'
          : 'Sellpia snapshot rows must be sorted by product-option identity',
      });
    }
    previousIdentity = identity;
  }
});
export type SellpiaInventoryBrowserSnapshot = z.infer<
  typeof SellpiaInventoryBrowserSnapshotSchema
>;

export const SourceImportTypeSchema = z.enum([
  'sellpia_inventory',
  'sellpia_product_profitability',
  'coupang_wing_catalog',
  'coupang_wing_catalog_basics',
  'coupang_wing_catalog_details',
  'coupang_rocket_catalog_seed',
  'coupang_rocket_po_catalog',
  'coupang_rocket_matching_csv',
  'sabangnet_mall_listings',
  'mall_admin_listings',
]);
export type SourceImportType = z.infer<typeof SourceImportTypeSchema>;

export const SOURCE_IMPORT_RUN_RUNNING_STATUS = 'running' as const;
export const SOURCE_IMPORT_RUN_COMPLETED_STATUS = 'completed' as const;
export const SOURCE_IMPORT_RUN_FAILED_STATUS = 'failed' as const;

/**
 * Every value `SourceImportRun.status` may hold. Source owners write only these
 * names, and readers compare against them instead of spelling the words again.
 */
export const SOURCE_IMPORT_RUN_STATUSES = [
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
] as const;
export const SourceImportStatusSchema = z.enum(SOURCE_IMPORT_RUN_STATUSES);
export type SourceImportStatus = z.infer<typeof SourceImportStatusSchema>;

export function isSourceImportStatus(value: string): value is SourceImportStatus {
  return SourceImportStatusSchema.safeParse(value).success;
}

const PositiveGenerationSchema = z.string().regex(/^[1-9]\d*$/);
const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const SellpiaProfitabilityPlanSchema = z.object({
  from: DateOnlySchema,
  to: DateOnlySchema,
  coveredMonths: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)).min(1).max(15),
}).strict();
export type SellpiaProfitabilityPlan = z.infer<typeof SellpiaProfitabilityPlanSchema>;

/** 최근 셀피아 상품 손익 실행 요약(KID-361: 실행 `analytics.sellpia_product_profitability`를 옛 attempt 모양으로 보인다). */
export const SellpiaProfitabilityAttemptSummarySchema = z.object({
  attemptId: z.string().uuid(),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  expiresAt: zIsoDate,
  capturedAt: zIsoDate,
  generation: PositiveGenerationSchema.nullable(),
  errorCode: z.string().trim().min(1).max(100).nullable(),
  errorMessage: z.string().trim().min(1).max(300).nullable(),
  plan: SellpiaProfitabilityPlanSchema,
}).strict();
export type SellpiaProfitabilityAttemptSummary = z.infer<
  typeof SellpiaProfitabilityAttemptSummarySchema
>;

const SourceImportRunObjectSchema = z.object({
  id: z.string().uuid(),
  sourceType: SourceImportTypeSchema,
  channelAccountId: z.string().uuid().nullable(),
  fileName: z.string().min(1).nullable(),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  status: SourceImportStatusSchema,
  rowCount: z.number().int().nonnegative(),
  importedAt: zIsoDate.nullable(),
  lastVerifiedAt: zIsoDate.nullable(),
  verificationCount: z.number().int().nonnegative(),
  lastTrigger: SellpiaInventoryStoredCollectionTriggerSchema.nullable(),
  freshnessGeneration: SellpiaInventoryGenerationSchema.nullable(),
  manualFreshExportConfirmedAt: zIsoDate.nullable(),
  manualFreshExportConfirmedBy: z.string().uuid().nullable(),
  qualityReport: SellpiaInventoryQualityReportSchema.nullable(),
  errorCode: z.string().trim().min(1).max(100).nullable(),
  errorMessage: z.string().trim().min(1).max(300).nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});

export const SourceImportRunSchema = SourceImportRunObjectSchema.superRefine(
  (run, ctx) => {
    const missingFileName = run.fileName === null;
    const missingFileHash = run.fileHash === null;
    if (missingFileName !== missingFileHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: missingFileName ? ['fileName'] : ['fileHash'],
        message: 'File name and hash must be present or null together',
      });
    }
    if (!missingFileName || !missingFileHash) return;

    if (
      run.sourceType !== 'sellpia_inventory' ||
      run.status !== SOURCE_IMPORT_RUN_FAILED_STATUS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fileName'],
        message: 'Only pre-download Sellpia failures may omit file provenance',
      });
    }
    if (run.rowCount !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rowCount'],
        message: 'Pre-download Sellpia failures cannot have imported rows',
      });
    }
    if (run.importedAt !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['importedAt'],
        message: 'Pre-download Sellpia failures cannot have an import timestamp',
      });
    }
    if (run.lastVerifiedAt !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lastVerifiedAt'],
        message: 'Pre-download Sellpia failures cannot have a verification timestamp',
      });
    }
    if (run.verificationCount !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['verificationCount'],
        message: 'Pre-download Sellpia failures cannot have verifications',
      });
    }
    if (run.qualityReport !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['qualityReport'],
        message: 'Pre-download Sellpia failures cannot have a quality report',
      });
    }
    if (run.manualFreshExportConfirmedAt !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['manualFreshExportConfirmedAt'],
        message: 'Pre-download Sellpia failures cannot have manual attestation',
      });
    }
    if (run.manualFreshExportConfirmedBy !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['manualFreshExportConfirmedBy'],
        message: 'Pre-download Sellpia failures cannot have a manual attestation actor',
      });
    }
    if (run.channelAccountId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['channelAccountId'],
        message: 'Pre-download Sellpia failures cannot have a channel account',
      });
    }
    if (!SellpiaInventoryCollectionFailureCodeSchema.safeParse(run.errorCode).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['errorCode'],
        message: 'Pre-download Sellpia failures require a collection failure code',
      });
    }
    if (run.errorMessage === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['errorMessage'],
        message: 'Pre-download Sellpia failures require an error message',
      });
    }
  },
);
export type SourceImportRun = z.infer<typeof SourceImportRunSchema>;

export const CompletedSourceArtifactRunSchema = SourceImportRunObjectSchema.extend({
  fileName: z.string().min(1),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.literal(SOURCE_IMPORT_RUN_COMPLETED_STATUS),
  importedAt: zIsoDate,
});
export type CompletedSourceArtifactRun = z.infer<
  typeof CompletedSourceArtifactRunSchema
>;

export const VerifiedSellpiaSourceImportRunSchema =
  CompletedSourceArtifactRunSchema.extend({
    lastVerifiedAt: zIsoDate,
    verificationCount: z.number().int().min(1),
  }).superRefine((run, ctx) => {
    if (run.sourceType !== 'sellpia_inventory') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceType'],
        message: 'Sellpia run must use sourceType sellpia_inventory',
      });
    }
    if (run.channelAccountId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['channelAccountId'],
        message: 'Sellpia run must not have a channel account',
      });
    }
  });
export type VerifiedSellpiaSourceImportRun = z.infer<
  typeof VerifiedSellpiaSourceImportRunSchema
>;

export const SellpiaInventoryImportOutcomeSchema = z.enum([
  'published',
  'same_hash_verified',
  'same_hash_confirmation_scheduled',
]);
export type SellpiaInventoryImportOutcome = z.infer<
  typeof SellpiaInventoryImportOutcomeSchema
>;

type ImportChanges = Record<string, number>;

type SuccessfulImportResponse<TChanges extends ImportChanges> = {
  duplicate: boolean;
  changes: TChanges;
};

function refineSuccessfulImportResponse<TChanges extends ImportChanges>(
  value: SuccessfulImportResponse<TChanges>,
  ctx: z.RefinementCtx,
): void {
  if (value.duplicate && Object.values(value.changes).some((count) => count !== 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['changes'],
      message: 'Duplicate imports must not report changes',
    });
  }
}

export const SellpiaInventoryImportResponseSchema = z.object({
  run: VerifiedSellpiaSourceImportRunSchema,
  duplicate: z.boolean(),
  outcome: SellpiaInventoryImportOutcomeSchema,
  changes: z.object({
    createdMasterProductCount: z.number().int().nonnegative(),
    updatedMasterProductCount: z.number().int().nonnegative(),
    inactivatedMasterProductCount: z.number().int().nonnegative(),
  }),
}).superRefine(refineSuccessfulImportResponse);
export type SellpiaInventoryImportResponse = z.infer<
  typeof SellpiaInventoryImportResponseSchema
>;

export const CoupangWingCatalogImportResponseSchema = z.object({
  run: CompletedSourceArtifactRunSchema.superRefine((value, ctx) => {
    if (value.sourceType !== 'coupang_wing_catalog') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceType'],
        message: 'Wing run must use sourceType coupang_wing_catalog',
      });
    }
    if (value.channelAccountId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['channelAccountId'],
        message: 'Wing run requires a channel account',
      });
    }
  }),
  duplicate: z.boolean(),
  changes: z.object({
    createdProductCount: z.number().int().nonnegative(),
    updatedProductCount: z.number().int().nonnegative(),
    createdSkuCount: z.number().int().nonnegative(),
    updatedSkuCount: z.number().int().nonnegative(),
    skippedRowCount: z.number().int().nonnegative(),
  }),
}).superRefine(refineSuccessfulImportResponse);
export type CoupangWingCatalogImportResponse = z.infer<
  typeof CoupangWingCatalogImportResponseSchema
>;
