import { z } from 'zod';
import { CompletedSourceArtifactRunSchema } from './source-import.js';

export const ROCKET_PO_LIST_PAGE_LIMIT = 20;
export const ROCKET_PO_DETAIL_LIMIT = 40;
export const ROCKET_PO_ROW_LIMIT = 4_000;

const boundedText = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => boundedText(max).min(1);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const RocketPoCollectionEvidenceSchema = z.object({
  collectionRunId: z.string().uuid(),
  vendorId: boundedText(120),
  listPagesRead: z.number().int().min(0).max(ROCKET_PO_LIST_PAGE_LIMIT),
  totalListPages: z.number().int().min(0).max(100_000),
  truncated: z.boolean(),
  detailPoCount: z.number().int().min(0).max(ROCKET_PO_DETAIL_LIMIT),
  failedPoNumbers: z.array(requiredText(80)).max(ROCKET_PO_DETAIL_LIMIT),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.failedPoNumbers).size !== value.failedPoNumbers.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['failedPoNumbers'],
      message: 'Failed PO numbers must be unique',
    });
  }
});
export type RocketPoCollectionEvidence = z.infer<
  typeof RocketPoCollectionEvidenceSchema
>;

export const RocketPoCatalogRowSchema = z.object({
  poLineId: requiredText(300),
  poNumber: requiredText(80),
  vendorId: boundedText(120),
  productNo: requiredText(60),
  barcode: boundedText(80),
  productName: requiredText(240),
  orderQty: z.number().int().nonnegative().max(10_000_000),
  plannedDeliveryDate: isoDay,
  poStatusCode: boundedText(20).optional(),
  businessDateBasis: z.enum(['ordered_at', 'expected_inbound']).optional(),
}).strict();
export type RocketPoCatalogRow = z.infer<typeof RocketPoCatalogRowSchema>;

export const RocketPurchasePreviewRequestSchema = z.object({
  channelAccountId: z.string().uuid(),
  collection: RocketPoCollectionEvidenceSchema,
  rows: z.array(RocketPoCatalogRowSchema).max(ROCKET_PO_ROW_LIMIT),
  editedQuantities: z.record(
    z.string().min(1).max(300),
    z.number().int().nonnegative().max(10_000_000),
  ).default({}),
  clampEditedQuantities: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  const lineIds = value.rows.map(({ poLineId }) => poLineId);
  if (new Set(lineIds).size !== lineIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rows'],
      message: 'PO line IDs must be unique',
    });
  }
  const known = new Set(lineIds);
  for (const lineId of Object.keys(value.editedQuantities)) {
    if (!known.has(lineId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['editedQuantities', lineId],
        message: 'Edited quantity references an unknown PO line',
      });
    }
  }
});
export type RocketPurchasePreviewRequest = z.infer<
  typeof RocketPurchasePreviewRequestSchema
>;

export const RocketPurchasePreviewReasonSchema = z.enum([
  'mapping_required',
  'component_inactive',
  'insufficient_capacity',
  'collection_incomplete',
  'vendor_mismatch',
]);
export type RocketPurchasePreviewReason = z.infer<
  typeof RocketPurchasePreviewReasonSchema
>;

export const RocketPoCatalogPublicationSchema = z.object({
  run: CompletedSourceArtifactRunSchema.superRefine((run, ctx) => {
    if (run.sourceType !== 'coupang_rocket_po_catalog') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceType'],
        message: 'Rocket catalog uses coupang_rocket_po_catalog',
      });
    }
    if (run.channelAccountId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['channelAccountId'],
        message: 'Rocket catalog requires a channel account',
      });
    }
  }),
  duplicate: z.boolean(),
  changes: z.object({
    createdProductCount: z.number().int().nonnegative(),
    updatedProductCount: z.number().int().nonnegative(),
    createdSkuCount: z.number().int().nonnegative(),
    updatedSkuCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type RocketPoCatalogPublication = z.infer<
  typeof RocketPoCatalogPublicationSchema
>;

export const RocketPurchasePreviewComponentSchema = z.object({
  masterProductId: z.string().uuid(),
  quantity: z.number().int().positive(),
  currentStock: z.number().int().nonnegative(),
  isActive: z.boolean(),
}).strict();
export type RocketPurchasePreviewComponent = z.infer<
  typeof RocketPurchasePreviewComponentSchema
>;

export const RocketPurchasePreviewRowSchema = z.object({
  poLineId: requiredText(300),
  poNumber: requiredText(80),
  productNo: requiredText(60),
  productName: requiredText(240),
  orderQuantity: z.number().int().nonnegative(),
  recommendedQuantity: z.number().int().nonnegative(),
  maxQuantity: z.number().int().nonnegative(),
  editedQuantity: z.number().int().nonnegative().nullable(),
  reason: RocketPurchasePreviewReasonSchema.nullable(),
  channelSkuId: z.string().uuid().nullable(),
  components: z.array(RocketPurchasePreviewComponentSchema).max(50),
}).strict();
export type RocketPurchasePreviewRow = z.infer<
  typeof RocketPurchasePreviewRowSchema
>;

export const RocketPurchasePreviewResponseSchema = z.object({
  collectionRunId: z.string().uuid(),
  catalog: RocketPoCatalogPublicationSchema.nullable(),
  rows: z.array(RocketPurchasePreviewRowSchema).max(ROCKET_PO_ROW_LIMIT),
}).strict();
export type RocketPurchasePreviewResponse = z.infer<
  typeof RocketPurchasePreviewResponseSchema
>;
