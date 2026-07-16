import { z } from 'zod';
import { zIsoDate } from './common.js';

export const ProductInventoryStatusSchema = z.enum([
  'sellable',
  'partial_out_of_stock',
  'out_of_stock',
  'configuration_required',
  'review_required',
]);
export type ProductInventoryStatus = z.infer<typeof ProductInventoryStatusSchema>;

export const ProductVariantWarningStateSchema = z.enum([
  'none',
  'configuration_required',
  'review_required',
]);
export type ProductVariantWarningState = z.infer<
  typeof ProductVariantWarningStateSchema
>;

export const ProductVariantComponentSourceSchema = z.enum([
  'manual',
  'deterministic',
]);
export type ProductVariantComponentSource = z.infer<
  typeof ProductVariantComponentSourceSchema
>;

export const ProductOperationsActiveStatusSchema = z.enum([
  'all',
  'active',
  'inactive',
]);
export type ProductOperationsActiveStatus = z.infer<
  typeof ProductOperationsActiveStatusSchema
>;

export const ProductOperationsAdStatusSchema = z.enum([
  'all',
  'active',
  'inactive',
  'unconfigured',
]);
export type ProductOperationsAdStatus = z.infer<
  typeof ProductOperationsAdStatusSchema
>;

export const ProductChannelStatusSchema = z.enum([
  'unlisted',
  'partial',
  'listed',
]);
export type ProductChannelStatus = z.infer<typeof ProductChannelStatusSchema>;

export const ProductOperationsPeriodDaysSchema = z.union([
  z.literal(7),
  z.literal(14),
  z.literal(30),
]);
export type ProductOperationsPeriodDays = z.infer<
  typeof ProductOperationsPeriodDaysSchema
>;

export const MasterProductOperationsListQuerySchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
  query: z.string().trim().min(1).max(200).optional(),
  periodDays: ProductOperationsPeriodDaysSchema.default(30),
  category: z.string().trim().min(1).max(100).optional(),
  activeStatus: ProductOperationsActiveStatusSchema.default('all'),
  inventoryStatus: ProductInventoryStatusSchema.optional(),
  abcGrade: z.string().trim().min(1).max(20).optional(),
  adStatus: ProductOperationsAdStatusSchema.default('all'),
}).strict();
export type MasterProductOperationsListQuery = z.infer<
  typeof MasterProductOperationsListQuerySchema
>;

export const ProductRecipeComponentCandidateQuerySchema = z.object({
  search: z.string().trim().min(2).max(200),
  limit: z.number().int().positive().max(50).default(20),
}).strict();
export type ProductRecipeComponentCandidateQuery = z.infer<
  typeof ProductRecipeComponentCandidateQuerySchema
>;

export const ProductRecipeComponentCandidateSchema = z.object({
  sellpiaInventorySkuId: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  optionName: z.string().nullable(),
  barcode: z.string().nullable(),
  currentStock: z.number().int().nonnegative(),
}).strict();
export type ProductRecipeComponentCandidate = z.infer<
  typeof ProductRecipeComponentCandidateSchema
>;

export const ProductRecipeComponentCandidateListResponseSchema = z.object({
  items: z.array(ProductRecipeComponentCandidateSchema).max(50),
}).strict();
export type ProductRecipeComponentCandidateListResponse = z.infer<
  typeof ProductRecipeComponentCandidateListResponseSchema
>;

const ProductCodeSchema = z.string().trim().min(1).max(100);
const ProductNameSchema = z.string().trim().min(1).max(200);

export const MasterProductDisplayReferenceSchema = z.object({
  type: z.enum(['product_code', 'channel_product']),
  label: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(200),
}).strict();
export type MasterProductDisplayReference = z.infer<
  typeof MasterProductDisplayReferenceSchema
>;

export const ProductVariantDisplayReferenceSchema = z.object({
  type: z.enum(['product_variant_code', 'channel_option']),
  label: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(200),
}).strict();
export type ProductVariantDisplayReference = z.infer<
  typeof ProductVariantDisplayReferenceSchema
>;

export const MasterProductOperationsMetadataSchema = z.object({
  id: z.string().uuid(),
  code: ProductCodeSchema,
  displayReference: MasterProductDisplayReferenceSchema,
  name: ProductNameSchema,
  description: z.string().nullable(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  tags: z.array(z.string().min(1)),
  imageUrls: z.array(z.string().min(1)),
  abcGrade: z.string().nullable(),
  profitTag: z.string().nullable(),
  adTier: z.string().nullable(),
  adBudgetLimit: z.number().int().nonnegative().nullable(),
  healthScore: z.number().int().min(0).max(100).nullable(),
  healthUpdatedAt: zIsoDate.nullable(),
  isActive: z.boolean(),
}).strict();
export type MasterProductOperationsMetadata = z.infer<
  typeof MasterProductOperationsMetadataSchema
>;

export const ProductVariantSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  configured: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
}).strict();
export type ProductVariantSummary = z.infer<typeof ProductVariantSummarySchema>;

export const MasterProductOperationsListItemSchema =
  MasterProductOperationsMetadataSchema.extend({
    updatedAt: zIsoDate,
    variantSummary: ProductVariantSummarySchema,
    inventoryUnits: z.number().int().nonnegative(),
    inventoryStatus: ProductInventoryStatusSchema,
    channelCount: z.number().int().nonnegative(),
    channelStatus: ProductChannelStatusSchema,
    traffic: z.number().int().nonnegative().nullable(),
    orderCount: z.number().int().nonnegative().nullable(),
    salesAmount: z.number().int().nonnegative().nullable(),
    adSpend: z.number().int().nonnegative().nullable(),
    profit: z.number().int().nullable(),
  });
export type MasterProductOperationsListItem = z.infer<
  typeof MasterProductOperationsListItemSchema
>;

export const ProductOperationsListSummarySchema = z.object({
  abcGradeCounts: z.object({
    A: z.number().int().nonnegative(),
    B: z.number().int().nonnegative(),
    C: z.number().int().nonnegative(),
  }).strict(),
  channelConnectionCounts: z.object({
    connected: z.number().int().nonnegative(),
    unconnected: z.number().int().nonnegative(),
  }).strict(),
  inventoryStatusCounts: z.object({
    sellable: z.number().int().nonnegative(),
    partial_out_of_stock: z.number().int().nonnegative(),
    out_of_stock: z.number().int().nonnegative(),
    configuration_required: z.number().int().nonnegative(),
    review_required: z.number().int().nonnegative(),
  }).strict(),
  negativeProfitCount: z.number().int().nonnegative(),
}).strict();
export type ProductOperationsListSummary = z.infer<
  typeof ProductOperationsListSummarySchema
>;

export const MasterProductOperationsListResponseSchema = z.object({
  items: z.array(MasterProductOperationsListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  summary: ProductOperationsListSummarySchema,
}).strict();
export type MasterProductOperationsListResponse = z.infer<
  typeof MasterProductOperationsListResponseSchema
>;

export const ProductVariantComponentDetailSchema = z.object({
  id: z.string().uuid(),
  sellpiaInventorySkuId: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  optionName: z.string().nullable(),
  barcode: z.string().nullable(),
  currentStock: z.number().int().nonnegative(),
  isActive: z.boolean(),
  quantity: z.number().int().positive(),
  source: ProductVariantComponentSourceSchema,
  confirmedBy: z.string().uuid().nullable(),
  confirmedAt: zIsoDate,
}).strict();
export type ProductVariantComponentDetail = z.infer<
  typeof ProductVariantComponentDetailSchema
>;

export const ProductVariantDetailSchema = z.object({
  id: z.string().uuid(),
  code: ProductCodeSchema,
  displayReference: ProductVariantDisplayReferenceSchema,
  name: ProductNameSchema,
  optionLabel: z.string().nullable(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  components: z.array(ProductVariantComponentDetailSchema).max(50),
  capacity: z.number().int().nonnegative().nullable(),
  warningState: ProductVariantWarningStateSchema,
}).strict();
export type ProductVariantDetail = z.infer<typeof ProductVariantDetailSchema>;

export const ProductChannelListingSummarySchema = z.object({
  id: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  channel: z.string().min(1),
  channelAccountName: z.string().min(1),
  externalId: z.string().min(1),
  displayName: z.string().nullable(),
  status: z.string().nullable(),
  isActive: z.boolean(),
}).strict();
export type ProductChannelListingSummary = z.infer<
  typeof ProductChannelListingSummarySchema
>;

export const MasterProductOperationsDetailSchema =
  MasterProductOperationsMetadataSchema.extend({
    createdAt: zIsoDate,
    updatedAt: zIsoDate,
    inventoryStatus: ProductInventoryStatusSchema,
    inventoryUnits: z.number().int().nonnegative(),
    channelListings: z.array(ProductChannelListingSummarySchema),
    variants: z.array(ProductVariantDetailSchema),
  });
export type MasterProductOperationsDetail = z.infer<
  typeof MasterProductOperationsDetailSchema
>;

export const ProductVariantRecipeComponentInputSchema = z.object({
  sellpiaInventorySkuId: z.string().uuid(),
  quantity: z.number().int().positive(),
}).strict();
export type ProductVariantRecipeComponentInput = z.infer<
  typeof ProductVariantRecipeComponentInputSchema
>;

function rejectDuplicateRecipeComponents(
  value: { components?: Array<{ sellpiaInventorySkuId: string }> },
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  value.components?.forEach((component, index) => {
    const key = component.sellpiaInventorySkuId.toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['components', index, 'sellpiaInventorySkuId'],
        message: 'duplicate sellpiaInventorySkuId',
      });
    }
    seen.add(key);
  });
}

const CreateProductVariantFieldsSchema = z.object({
  code: ProductCodeSchema,
  name: ProductNameSchema,
  optionLabel: z.string().trim().min(1).max(200).nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  components: z.array(ProductVariantRecipeComponentInputSchema).max(50).optional(),
}).strict();

export const CreateProductVariantInputSchema =
  CreateProductVariantFieldsSchema.superRefine(rejectDuplicateRecipeComponents);
export type CreateProductVariantInput = z.infer<
  typeof CreateProductVariantInputSchema
>;

const MasterProductMutationFieldsSchema = z.object({
  code: ProductCodeSchema,
  name: ProductNameSchema,
  description: z.string().nullable(),
  category: z.string().trim().min(1).max(100).nullable(),
  brand: z.string().trim().min(1).max(100).nullable(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50),
  imageUrls: z.array(z.string().trim().min(1).max(2_000)).max(50),
  abcGrade: z.string().trim().min(1).max(20).nullable(),
  profitTag: z.string().trim().min(1).max(50).nullable(),
  adTier: z.string().trim().min(1).max(50).nullable(),
  adBudgetLimit: z.number().int().nonnegative().nullable(),
  healthScore: z.number().int().min(0).max(100).nullable(),
  isActive: z.boolean(),
}).strict();

export const CreateMasterProductInputSchema = z.object({
  code: ProductCodeSchema,
  name: ProductNameSchema,
  description: z.string().nullable().optional(),
  category: z.string().trim().min(1).max(100).nullable().optional(),
  brand: z.string().trim().min(1).max(100).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  imageUrls: z.array(z.string().trim().min(1).max(2_000)).max(50).optional(),
  abcGrade: z.string().trim().min(1).max(20).nullable().optional(),
  profitTag: z.string().trim().min(1).max(50).nullable().optional(),
  adTier: z.string().trim().min(1).max(50).nullable().optional(),
  adBudgetLimit: z.number().int().nonnegative().nullable().optional(),
  healthScore: z.number().int().min(0).max(100).nullable().optional(),
  isActive: z.boolean().optional(),
  variants: z.array(CreateProductVariantInputSchema).min(1).optional(),
}).strict();
export type CreateMasterProductInput = z.infer<
  typeof CreateMasterProductInputSchema
>;

export const UpdateMasterProductInputSchema =
  MasterProductMutationFieldsSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    { message: 'At least one product field is required' },
  );
export type UpdateMasterProductInput = z.infer<
  typeof UpdateMasterProductInputSchema
>;

export const UpdateProductVariantInputSchema = z.object({
  code: ProductCodeSchema.optional(),
  name: ProductNameSchema.optional(),
  optionLabel: z.string().trim().min(1).max(200).nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one variant field is required' },
);
export type UpdateProductVariantInput = z.infer<
  typeof UpdateProductVariantInputSchema
>;

export const ReplaceProductVariantRecipeInputSchema = z.object({
  components: z.array(ProductVariantRecipeComponentInputSchema).max(50),
}).strict().superRefine(rejectDuplicateRecipeComponents);
export type ReplaceProductVariantRecipeInput = z.infer<
  typeof ReplaceProductVariantRecipeInputSchema
>;
