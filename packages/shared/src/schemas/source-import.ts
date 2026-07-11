import { z } from 'zod';
import { zIsoDate } from './common.js';

export const SourceImportTypeSchema = z.enum([
  'sellpia_inventory',
  'coupang_wing_catalog',
]);
export type SourceImportType = z.infer<typeof SourceImportTypeSchema>;

export const SourceImportStatusSchema = z.enum(['running', 'completed', 'failed']);
export type SourceImportStatus = z.infer<typeof SourceImportStatusSchema>;

export const SourceImportRunSchema = z.object({
  id: z.string().uuid(),
  sourceType: SourceImportTypeSchema,
  channelAccountId: z.string().uuid().nullable(),
  fileName: z.string().min(1),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: SourceImportStatusSchema,
  rowCount: z.number().int().nonnegative(),
  importedAt: zIsoDate.nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type SourceImportRun = z.infer<typeof SourceImportRunSchema>;

type ImportChanges = Record<string, number>;

type SuccessfulImportResponse<TChanges extends ImportChanges> = {
  run: SourceImportRun;
  duplicate: boolean;
  changes: TChanges;
};

function refineSuccessfulImportResponse<TChanges extends ImportChanges>(
  value: SuccessfulImportResponse<TChanges>,
  ctx: z.RefinementCtx,
): void {
  if (value.run.status !== 'completed') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['run', 'status'],
      message: 'Successful import responses require a completed run',
    });
  }
  if (value.run.importedAt === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['run', 'importedAt'],
      message: 'Successful import responses require an import timestamp',
    });
  }
  if (value.duplicate && Object.values(value.changes).some((count) => count !== 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['changes'],
      message: 'Duplicate imports must not report changes',
    });
  }
}

export const SellpiaInventoryImportResponseSchema = z.object({
  run: SourceImportRunSchema.superRefine((value, ctx) => {
    if (value.sourceType !== 'sellpia_inventory') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceType'],
        message: 'Sellpia run must use sourceType sellpia_inventory',
      });
    }
    if (value.channelAccountId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['channelAccountId'],
        message: 'Sellpia run must not have a channel account',
      });
    }
  }),
  duplicate: z.boolean(),
  changes: z.object({
    createdSkuCount: z.number().int().nonnegative(),
    updatedSkuCount: z.number().int().nonnegative(),
    zeroedSkuCount: z.number().int().nonnegative(),
  }),
}).superRefine(refineSuccessfulImportResponse);
export type SellpiaInventoryImportResponse = z.infer<
  typeof SellpiaInventoryImportResponseSchema
>;

export const CoupangWingCatalogImportResponseSchema = z.object({
  run: SourceImportRunSchema.superRefine((value, ctx) => {
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
