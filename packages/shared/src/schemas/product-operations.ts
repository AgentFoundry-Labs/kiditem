import { z } from 'zod';
import { SourceReadinessSchema } from '../source-readiness.js';
import { zIsoDate } from './common.js';
import { DashboardPeriodBasisSchema } from './dashboard.js';
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
  'uncollected',
  'out_of_stock',
  'configuration_required',
  'review_required',
]);
export type ProductInventoryStatus = z.infer<typeof ProductInventoryStatusSchema>;

export const ProductInventoryFactsSchema = z.object({
  skuCount: z.number().int().nonnegative(),
  measuredSkuCount: z.number().int().nonnegative(),
}).strict().refine((facts) => facts.measuredSkuCount <= facts.skuCount,
  'inventory counts must be nested subsets');
export type ProductInventoryFacts = z.infer<typeof ProductInventoryFactsSchema>;

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

export const ProductOperationsSortSchema = z.enum(['latest', 'revenue', 'stock', 'sold']);
export type ProductOperationsSort = z.infer<typeof ProductOperationsSortSchema>;

export const MasterProductOperationsListQuerySchema = z.object({
  sort: ProductOperationsSortSchema.default('latest'),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
  query: z.string().trim().min(1).max(200).optional(),
  periodDays: ProductOperationsPeriodDaysSchema.default(30),
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
  masterProductId: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  optionName: z.string().nullable(),
  barcode: z.string().nullable(),
  currentStock: z.number().int().nonnegative().nullable(),
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
  imageUrls: z.array(z.string().min(1)),
  displayImageUrls: z.array(z.string().min(1)),
  abcGrade: ProductAbcGradeSchema.nullable(),
  abcEvaluation: ProductAbcEvaluationSchema.nullable(),
  abc: ProductAbcReadModelSchema,
  contribution: ProductAbcContributionProductSchema.nullable(),
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
  monthlyOutflow: z.number().nonnegative().nullable(),
  outflowMonthCount: z.number().int().nonnegative(),
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

/**
 * Wing traffic freshness is the capture time and the period basis the views
 * and cart adds were summed over. Nothing derived from the basis travels
 * beside it (ADR-0006): views and cart adds are measured unless
 * `periodBasisStatus(basis)` is `empty`, and visitors only when it is
 * `complete`.
 */
const ProductOperationsTrafficFreshnessSchema = z.object({
  capturedAt: zIsoDate.nullable(),
  basis: DashboardPeriodBasisSchema,
}).strict();

export const ProductOperationsDataSourceStatusSchema = SourceReadinessSchema;
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
    orders: ProductOperationsDataSourceStatusSchema,
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

/** Current KST-month source facts; source coverage is distinct from current stock and ABC cutoff. */
export const ProductMonthlySalesSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  revenue: z.number().finite(),
  soldQuantity: z.number().finite(),
  cost: z.number().finite().nullable(),
  grossProfit: z.number().finite().nullable(),
  grossMarginRate: z.number().finite().nullable(),
  coverageStartDate: zIsoDate,
  coverageEndDate: zIsoDate,
}).strict();
export type ProductMonthlySales = z.infer<typeof ProductMonthlySalesSchema>;

export const MasterProductOperationsListItemSchema =
  MasterProductOperationsMetadataSchema.extend({
    isSelling: z.boolean(),
    monthly: ProductMonthlySalesSchema.nullable(),
    updatedAt: zIsoDate,
    depletion: ProductDepletionProjectionSchema,
    channelOptionSummary: ChannelOptionSummarySchema,
    inventoryUnits: z.number().int().nonnegative().nullable(),
    inventory: ProductInventoryFactsSchema,
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
      traffic: ProductOperationsTrafficFreshnessSchema,
      advertising: ProductOperationsMetricFreshnessSchema,
      orders: ProductOperationsMetricFreshnessSchema,
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
  contributionOverview: ProductAbcContributionOverviewSchema.nullable(),
  abcFormula: ProductAbcFormulaPayloadSchema.nullable(),
  // The retained ABC publication's cutoff. Null until Products publishes, when
  // `abcGradeCounts.A/B/C` measure nothing and must not read as 0.
  abcOfficialCutoffDate: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).nullable(),
  displayDataAsOf: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).nullable(),
  channelProductCounts: z.array(ProductOperationsChannelProductCountSchema),
  inventoryStatusCounts: z.object({
    sellable: z.number().int().nonnegative(),
    out_of_stock: z.number().int().nonnegative(),
    configuration_required: z.number().int().nonnegative(),
    review_required: z.number().int().nonnegative(),
    uncollected: z.number().int().nonnegative(),
  }).strict(),
  negativeProfitCount: z.number().int().nonnegative(),
  imminentProductCount: z.number().int().nonnegative(),
  reorderProductCount: z.number().int().nonnegative(),
  depletionCoveredProductCount: z.number().int().nonnegative(),
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
      masterProductId: z.string().uuid(),
      code: z.string().min(1).nullable(),
      name: z.string().min(1).nullable(),
      optionName: z.string().nullable(),
      barcode: z.string().nullable(),
      currentStock: z.number().int().nonnegative().nullable(),
      quantity: z.number().int().positive(),
    }).strict()).max(50),
  }).strict()),
}).strict();
export type ProductChannelListingSummary = z.infer<
  typeof ProductChannelListingSummarySchema
>;

export const MasterProductOperationsDetailSchema =
  MasterProductOperationsMetadataSchema.extend({
    createdAt: zIsoDate,
    updatedAt: zIsoDate,
    inventory: ProductInventoryFactsSchema,
    inventoryUnits: z.number().int().nonnegative().nullable(),
    channelListings: z.array(ProductChannelListingSummarySchema),
  });
export type MasterProductOperationsDetail = z.infer<
  typeof MasterProductOperationsDetailSchema
>;

export const ChannelOptionInventoryComponentInputSchema = z.object({
  masterProductId: z.string().uuid(),
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
  value: { components?: Array<{ masterProductId: string }> },
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  value.components?.forEach((component, index) => {
    const key = component.masterProductId.toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['components', index, 'masterProductId'],
        message: 'duplicate masterProductId',
      });
    }
    seen.add(key);
  });
}

export const UpdateMasterProductInputSchema = z.object({
  imageUrls: z.array(z.string().trim().min(1).max(2_000)).max(50),
}).strict();
export type UpdateMasterProductInput = z.infer<
  typeof UpdateMasterProductInputSchema
>;
