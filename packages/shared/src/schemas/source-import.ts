import { z } from 'zod';
import { zIsoDate } from './common.js';
import {
  SellpiaInventoryGenerationSchema,
  SellpiaInventoryQualityReportSchema,
  SellpiaInventoryRefreshReasonSchema,
} from './sellpia-inventory-freshness.js';

export const SourceImportTypeSchema = z.enum([
  'sellpia_inventory',
  'coupang_wing_catalog',
  'coupang_rocket_po_catalog',
]);
export type SourceImportType = z.infer<typeof SourceImportTypeSchema>;

export const SourceImportStatusSchema = z.enum(['running', 'completed', 'failed']);
export type SourceImportStatus = z.infer<typeof SourceImportStatusSchema>;

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
  lastTrigger: SellpiaInventoryRefreshReasonSchema.nullable(),
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
    if (
      (missingFileName || missingFileHash) &&
      (run.sourceType !== 'sellpia_inventory' || run.status !== 'failed')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fileName'],
        message: 'Only pre-download Sellpia failures may omit file provenance',
      });
    }
    if ((missingFileName || missingFileHash) && run.importedAt !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['importedAt'],
        message: 'Pre-download Sellpia failures cannot have an import timestamp',
      });
    }
  },
);
export type SourceImportRun = z.infer<typeof SourceImportRunSchema>;

export const CompletedSourceArtifactRunSchema = SourceImportRunObjectSchema.extend({
  fileName: z.string().min(1),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.literal('completed'),
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
