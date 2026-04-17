import { z } from 'zod';
import { zIsoDate } from './common.js';

// ===== Master (family) =====
export const MasterSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  code: z.string(),
  legacyCode: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  category: z.string().nullable(),
  brand: z.string().nullable(),
  tags: z.array(z.string()),
  optionCounter: z.number().int(),
  thumbnailUrl: z.string().url().nullable(),
  imageUrl: z.string().url().nullable(),
  images: z.array(z.string().url()).nullable(),
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
  supplierId: z.string().uuid().nullable(),
  isDeleted: z.boolean(),
  deletedAt: zIsoDate.nullable(),
  isTemporary: z.boolean(),
  temporaryReason: z.string().nullable(),
  memo: z.string().nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type Master = z.infer<typeof MasterSchema>;

export const ProductOptionSchema = z.object({
  id: z.string().uuid(),
  masterId: z.string().uuid(),
  companyId: z.string().uuid(),
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
  companyId: z.string().uuid(),
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
