import { z } from 'zod';
import { zIsoDate } from './common.js';

// ===== Image item =====
// Role enum is the canonical source of truth; the web hub-roles config mirrors
// these values (apps/web/src/lib/hub-roles.ts re-exports this type so drift is
// compile-caught).
export const MasterImageRoleSchema = z.enum([
  'box',
  'product',
  'color_variant',
  'size_chart',
  'detail',
]);
export type MasterImageRole = z.infer<typeof MasterImageRoleSchema>;

export const MasterImageItemSchema = z.object({
  id: z.string().uuid().optional(),
  url: z.string().url(),
  storageKey: z.string().nullable().optional(),
  role: MasterImageRoleSchema,
  label: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  source: z.string().optional(),
  mimeType: z.string().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  fileSize: z.number().int().nonnegative().nullable().optional(),
  isPrimary: z.boolean().optional(),
});
export type MasterImageItem = z.infer<typeof MasterImageItemSchema>;

// ===== Image endpoint envelopes (ADR-0020 successor, W1) =====
export const GetMasterImagesResponseSchema = z.object({
  images: z.array(MasterImageItemSchema),
});
export type GetMasterImagesResponse = z.infer<typeof GetMasterImagesResponseSchema>;

export const UpdateMasterImagesRequestSchema = z.object({
  items: z.array(MasterImageItemSchema),
});
export type UpdateMasterImagesRequest = z.infer<typeof UpdateMasterImagesRequestSchema>;

export const UploadMasterImageResponseSchema = z.object({
  image: MasterImageItemSchema,
});
export type UploadMasterImageResponse = z.infer<typeof UploadMasterImageResponseSchema>;

// ===== Money range (derived display) =====
export const MoneyRangeSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
});
export type MoneyRange = z.infer<typeof MoneyRangeSchema>;

// ===== Master (family) =====
export const MasterSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  code: z.string(),
  legacyCode: z.string().nullable(),
  // Source barcode/EAN (ADR-0022). Non-unique — search may return multiple
  // masters. Distinct from `ProductOptionSchema.barcode` which is the true
  // option/scanner barcode and remains unique per organization.
  barcode: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  tags: z.array(z.string()),
  optionCounter: z.number().int(),
  thumbnailUrl: z.string().url().nullable(),
  imageUrl: z.string().url().nullable(),
  images: z.array(MasterImageItemSchema).nullable(),
  abcGrade: z.enum(['A', 'B', 'C']).nullable(),
  profitTag: z.string().nullable(),
  adTier: z.string().nullable(),
  adBudgetLimit: z.number().int().nullable(),
  healthScore: z.number().int().nullable(),
  healthUpdatedAt: zIsoDate.nullable(),
  sourceUrl: z.string().url().nullable(),
  sourcePlatform: z.string().nullable(),
  costCny: z.number().nullable(),
  marginRate: z.number().nullable(),
  pipelineStep: z.string().nullable(),
  detailPageUrl: z.string().url().nullable(),
  thumbnailStrategy: z.enum(['standard', 'premium', 'custom']),
  isDeleted: z.boolean(),
  deletedAt: zIsoDate.nullable(),
  isTemporary: z.boolean(),
  temporaryReason: z.string().nullable(),
  memo: z.string().nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type Master = z.infer<typeof MasterSchema>;

// ===== Product option (sellable SKU) =====
export const ProductOptionSchema = z.object({
  id: z.string().uuid(),
  masterId: z.string().uuid(),
  organizationId: z.string().uuid(),
  sku: z.string(),
  barcode: z.string().nullable(),
  legacyCode: z.string().nullable(),
  optionName: z.string().nullable(),
  sortOrder: z.number().int(),
  costPrice: z.number().int().nullable(),
  sellPrice: z.number().int().nullable(),
  commissionRate: z.number().nullable(),
  shippingCost: z.number().int().nullable(),
  otherCost: z.number().int().nullable(),
  isBundle: z.boolean(),
  availableStock: z.number().int().nullable(),
  isDeleted: z.boolean(),
  deletedAt: zIsoDate.nullable(),
  isTemporary: z.boolean(),
  temporaryReason: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type ProductOption = z.infer<typeof ProductOptionSchema>;

export const BundleComponentSchema = z.object({
  id: z.string().uuid(),
  bundleOptionId: z.string().uuid(),
  componentOptionId: z.string().uuid(),
  organizationId: z.string().uuid(),
  qty: z.number().int().min(1),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type BundleComponent = z.infer<typeof BundleComponentSchema>;

export const MasterWithOptionsSchema = MasterSchema.extend({
  options: z.array(ProductOptionSchema),
});
export type MasterWithOptions = z.infer<typeof MasterWithOptionsSchema>;

export const OptionWithComponentsSchema = ProductOptionSchema.extend({
  components: z.array(BundleComponentSchema),
});
export type OptionWithComponents = z.infer<typeof OptionWithComponentsSchema>;

// ===== Catalog read model =====
export const ProductCatalogListItemSchema = MasterSchema.extend({
  optionCount: z.number().int().nonnegative(),
  representativeSku: z.string().nullable(),
  priceRange: MoneyRangeSchema.nullable(),
  costRange: MoneyRangeSchema.nullable(),
  totalAvailableStock: z.number().int().nonnegative(),
});
export type ProductCatalogListItem = z.infer<typeof ProductCatalogListItemSchema>;

export const ProductCatalogDetailSchema = ProductCatalogListItemSchema.extend({
  options: z.array(ProductOptionSchema),
});
export type ProductCatalogDetail = z.infer<typeof ProductCatalogDetailSchema>;

export const ProductCatalogCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  gradeA: z.number().int().nonnegative(),
  gradeB: z.number().int().nonnegative(),
  gradeC: z.number().int().nonnegative(),
  adCount: z.number().int().nonnegative(),
  noAdCount: z.number().int().nonnegative(),
  draftCount: z.number().int().nonnegative(),
  processingCount: z.number().int().nonnegative(),
  processedCount: z.number().int().nonnegative(),
  discontinuedCount: z.number().int().nonnegative(),
  temporaryCount: z.number().int().nonnegative(),
});
export type ProductCatalogCounts = z.infer<typeof ProductCatalogCountsSchema>;

export const ProductCatalogListResponseSchema = z.object({
  items: z.array(ProductCatalogListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
export type ProductCatalogListResponse = z.infer<typeof ProductCatalogListResponseSchema>;
