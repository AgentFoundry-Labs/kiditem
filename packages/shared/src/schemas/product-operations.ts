import { z } from 'zod';
import { zIsoDate } from './common.js';
import {
  ProductAbcContributionOverviewSchema,
  ProductAbcContributionProductSchema,
  ProductAbcDisplayStatusSchema,
  ProductAbcEvaluationSchema,
  ProductAbcFormulaPayloadSchema,
  ProductAbcGradeSchema,
  ProductAbcReadModelSchema,
} from './product-abc.js';

export const ProductInventoryStatusSchema = z.enum([
  'sellable',
  'partial_out_of_stock',
  'out_of_stock',
  'configuration_required',
  'review_required',
]);
export type ProductInventoryStatus = z.infer<typeof ProductInventoryStatusSchema>;

export const ProductOperationsInventoryFocusSchema = z.enum([
  'attention',
  'out_of_stock',
  'imminent',
  'reorder',
]);
export type ProductOperationsInventoryFocus = z.infer<
  typeof ProductOperationsInventoryFocusSchema
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

export const ProductOperationsAbcGradeFilterSchema = z.union([
  ProductAbcGradeSchema,
  z.literal('unclassified'),
]);
export type ProductOperationsAbcGradeFilter = z.infer<
  typeof ProductOperationsAbcGradeFilterSchema
>;

export const ProductOperationsAbcCalculationStatusFilterSchema =
  ProductAbcDisplayStatusSchema;
export type ProductOperationsAbcCalculationStatusFilter = z.infer<
  typeof ProductOperationsAbcCalculationStatusFilterSchema
>;

export const MasterProductOperationsListQuerySchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
  query: z.string().trim().min(1).max(200).optional(),
  periodDays: ProductOperationsPeriodDaysSchema.default(30),
  category: z.string().trim().min(1).max(100).optional(),
  activeStatus: ProductOperationsActiveStatusSchema.default('active'),
  inventoryStatus: ProductInventoryStatusSchema.optional(),
  inventoryFocus: ProductOperationsInventoryFocusSchema.optional(),
  abcGrade: ProductOperationsAbcGradeFilterSchema.optional(),
  abcCalculationStatus: ProductOperationsAbcCalculationStatusFilterSchema.optional(),
  adStatus: ProductOperationsAdStatusSchema.default('all'),
}).strict();
export type MasterProductOperationsListQuery = z.infer<
  typeof MasterProductOperationsListQuerySchema
>;

export const ProductRecipeComponentCandidateQuerySchema = z.object({
  search: z.string().trim().min(2).max(200),
  limit: z.number().int().positive().max(50).default(20),
  stockStatus: z.enum(['in_stock', 'all']).default('in_stock'),
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
  displayImageUrls: z.array(z.string().min(1)),
  abcGrade: ProductAbcGradeSchema.nullable(),
  abcEvaluation: ProductAbcEvaluationSchema.nullable(),
  abc: ProductAbcReadModelSchema,
  contribution: ProductAbcContributionProductSchema.nullable(),
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

export const ChannelOptionSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  configured: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
}).strict();
export type ChannelOptionSummary = z.infer<typeof ChannelOptionSummarySchema>;

export const ProductDepletionProjectionSchema = z.object({
  coverage: z.enum(['ready', 'shared', 'no_direct_sales']),
  needsReorder: z.boolean(),
  reorderSkuCount: z.number().int().nonnegative(),
  minMonthsOfAvailableStockLeft: z.number().nonnegative().nullable(),
}).strict();
export type ProductDepletionProjection = z.infer<
  typeof ProductDepletionProjectionSchema
>;

const ProductOperationsMetricFreshnessSchema = z.object({
  ready: z.boolean(),
  coverageStartDate: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).nullable(),
  coverageEndDate: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).nullable(),
  capturedAt: zIsoDate.nullable(),
}).strict();

export const ProductOperationsDataSourceStatusSchema = z.object({
  ready: z.boolean(),
  actualCutoff: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).nullable(),
  capturedAt: zIsoDate.nullable(),
  latestAttemptState: z.enum(['RUNNING', 'COMPLETE', 'FAILED']).nullable(),
  errorCode: z.string().trim().min(1).max(120).nullable(),
}).strict();
export type ProductOperationsDataSourceStatus = z.infer<
  typeof ProductOperationsDataSourceStatusSchema
>;

export const ProductOperationsDataStatusSchema = z.object({
  displayDataAsOf: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).nullable(),
  formulaRevision: z.number().int().nonnegative(),
  publicationRevision: z.number().int().nonnegative(),
  officialCutoff: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).nullable(),
  publishedAt: zIsoDate.nullable(),
  actualCutoff: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).nullable(),
  sources: z.object({
    traffic: ProductOperationsDataSourceStatusSchema,
    advertising: ProductOperationsDataSourceStatusSchema,
    sellpia: ProductOperationsDataSourceStatusSchema,
    mapping: z.object({
      ready: z.boolean(),
      generation: z.string().regex(/^\d+$/).nullable(),
    }).strict(),
  }).strict(),
  abcSummary: z.object({
    classifiedProductCount: z.number().int().nonnegative(),
    unclassifiedProductCount: z.number().int().nonnegative(),
    mappingRequiredProductCount: z.number().int().nonnegative(),
    otherPendingProductCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type ProductOperationsDataStatus = z.infer<
  typeof ProductOperationsDataStatusSchema
>;

export const MasterProductOperationsListItemSchema =
  MasterProductOperationsMetadataSchema.extend({
    isSelling: z.boolean(),
    updatedAt: zIsoDate,
    depletion: ProductDepletionProjectionSchema,
    channelOptionSummary: ChannelOptionSummarySchema,
    inventoryUnits: z.number().int().nonnegative(),
    inventoryStatus: ProductInventoryStatusSchema,
    channelCount: z.number().int().nonnegative(),
    channelStatus: ProductChannelStatusSchema,
    activeChannels: z.array(z.object({
      channelAccountId: z.string().uuid(),
      channel: z.string().min(1),
      channelAccountName: z.string().min(1),
    }).strict()),
    traffic: z.number().int().nonnegative().nullable(),
    visitorCount: z.number().int().nonnegative().nullable(),
    viewCount: z.number().int().nonnegative().nullable(),
    cartAddCount: z.number().int().nonnegative().nullable(),
    orderCount: z.number().int().nonnegative().nullable(),
    salesQuantity: z.number().int().nonnegative().nullable(),
    salesAmount: z.number().int().nonnegative().nullable(),
    adSpend: z.number().int().nonnegative().nullable(),
    adSpendRate: z.number().finite().nonnegative().nullable(),
    metricsFreshness: z.object({
      traffic: ProductOperationsMetricFreshnessSchema,
      advertising: ProductOperationsMetricFreshnessSchema,
    }).strict(),
  });
export type MasterProductOperationsListItem = z.infer<
  typeof MasterProductOperationsListItemSchema
>;

export const ProductOperationsActiveChannelSchema = z.object({
  channelAccountId: z.string().uuid(),
  channel: z.string().min(1),
  channelAccountName: z.string().min(1),
}).strict();
export type ProductOperationsActiveChannel = z.infer<
  typeof ProductOperationsActiveChannelSchema
>;

export const ProductOperationsChannelProductCountSchema = ProductOperationsActiveChannelSchema.extend({
  count: z.number().int().nonnegative(),
}).strict();
export type ProductOperationsChannelProductCount = z.infer<
  typeof ProductOperationsChannelProductCountSchema
>;

export const ProductOperationsListSummarySchema = z.object({
  abcGradeCounts: z.object({
    A: z.number().int().nonnegative(),
    B: z.number().int().nonnegative(),
    C: z.number().int().nonnegative(),
    unclassified: z.number().int().nonnegative(),
  }).strict(),
  abcStatusCounts: z.object({
    NEW: z.number().int().nonnegative(),
    READY: z.number().int().nonnegative(),
    INSUFFICIENT_EVIDENCE: z.number().int().nonnegative(),
    SOURCE_UNMAPPED: z.number().int().nonnegative(),
    SELLPIA_SOURCE_STALE: z.number().int().nonnegative(),
    AD_SOURCE_STALE: z.number().int().nonnegative(),

  }).strict(),
  contributionOverview: ProductAbcContributionOverviewSchema.nullable(),
  abcFormula: ProductAbcFormulaPayloadSchema.nullable(),
  displayDataAsOf: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).nullable(),
  channelProductCounts: z.array(ProductOperationsChannelProductCountSchema),
  inventoryStatusCounts: z.object({
    sellable: z.number().int().nonnegative(),
    partial_out_of_stock: z.number().int().nonnegative(),
    out_of_stock: z.number().int().nonnegative(),
    configuration_required: z.number().int().nonnegative(),
    review_required: z.number().int().nonnegative(),
  }).strict(),
  negativeProfitCount: z.number().int().nonnegative(),
  imminentProductCount: z.number().int().nonnegative(),
  reorderProductCount: z.number().int().nonnegative(),
  depletionCoveredProductCount: z.number().int().nonnegative(),
  sharedDepletionProductCount: z.number().int().nonnegative(),
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

export const ProductChannelListingSummarySchema = z.object({
  id: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  channel: z.string().min(1),
  channelAccountName: z.string().min(1),
  externalId: z.string().min(1),
  displayName: z.string().nullable(),
  status: z.string().nullable(),
  isActive: z.boolean(),
  options: z.array(z.object({
    id: z.string().uuid(),
    externalOptionId: z.string().min(1),
    itemName: z.string().nullable(),
    sellerSku: z.string().nullable(),
    barcode: z.string().nullable(),
    status: z.string().nullable(),
    isActive: z.boolean(),
    capacity: z.number().int().nonnegative().nullable(),
    inventoryComponents: z.array(z.object({
      id: z.string().uuid(),
      sellpiaInventorySkuId: z.string().uuid(),
      code: z.string().min(1),
      name: z.string().min(1),
      optionName: z.string().nullable(),
      barcode: z.string().nullable(),
      currentStock: z.number().int().nonnegative(),
      availableStock: z.number().int().nonnegative(),
      isActive: z.boolean(),
      quantity: z.number().int().positive(),
    }).strict().superRefine((component, ctx) => {
      if (component.availableStock !== component.currentStock) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['availableStock'],
          message: 'availableStock must equal currentStock',
        });
      }
    })).max(50),
  }).strict()),
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
  });
export type MasterProductOperationsDetail = z.infer<
  typeof MasterProductOperationsDetailSchema
>;

export const ChannelOptionInventoryComponentInputSchema = z.object({
  sellpiaInventorySkuId: z.string().uuid(),
  quantity: z.number().int().positive(),
}).strict();
export type ChannelOptionInventoryComponentInput = z.infer<
  typeof ChannelOptionInventoryComponentInputSchema
>;

export const ReplaceChannelOptionInventoryInputSchema = z.object({
  components: z.array(ChannelOptionInventoryComponentInputSchema).max(50),
}).strict().superRefine(rejectDuplicateRecipeComponents);
export type ReplaceChannelOptionInventoryInput = z.infer<
  typeof ReplaceChannelOptionInventoryInputSchema
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

const MasterProductMutationFieldsSchema = z.object({
  code: ProductCodeSchema,
  name: ProductNameSchema,
  description: z.string().nullable(),
  category: z.string().trim().min(1).max(100).nullable(),
  brand: z.string().trim().min(1).max(100).nullable(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50),
  imageUrls: z.array(z.string().trim().min(1).max(2_000)).max(50),
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
  profitTag: z.string().trim().min(1).max(50).nullable().optional(),
  adTier: z.string().trim().min(1).max(50).nullable().optional(),
  adBudgetLimit: z.number().int().nonnegative().nullable().optional(),
  healthScore: z.number().int().min(0).max(100).nullable().optional(),
  isActive: z.boolean().optional(),
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
