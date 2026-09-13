import { z } from 'zod';

const NumericTextSchema = z.union([z.number(), z.string().min(1)]);

const PriceTierV1Schema = z.union([
  z.object({
    beginAmount: NumericTextSchema,
    price: NumericTextSchema,
  }).passthrough(),
  z.object({
    min_quantity: NumericTextSchema,
    max_quantity: NumericTextSchema.nullable().optional(),
    unit_price: NumericTextSchema,
  }).passthrough(),
]);

const SourceUrlSchema = z.string().url().max(2_000);
const CommercialRecordSchema = z.record(z.unknown());

/**
 * KidItem OS extraction wire shape. Preserve these commercial snake_case
 * fields when changing collection transport or source-attempt lifecycle.
 */
export const SourcingExtensionV1ProductSchema = z.object({
  page_type: z.enum(['detail', 'description', 'search']).optional(),
  source_url: SourceUrlSchema,
  source_platform: z.string().min(1).max(64).optional(),
  product_id: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10_000).optional(),
  description_text: z.string().max(10_000).optional(),
  images: z.array(SourceUrlSchema).max(200).default([]),
  description_images: z.array(SourceUrlSchema).max(200).default([]),
  detail_images: z.array(SourceUrlSchema).max(200).default([]),
  category_name: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).max(50).default([]),
  price: z.number().nonnegative().optional(),
  price_min: z.number().nonnegative().nullable().optional(),
  price_max: z.number().nonnegative().nullable().optional(),
  priceRange: z.string().max(120).optional(),
  currency: z.string().min(3).max(8).optional(),
  moq: z.number().int().nonnegative().nullable().optional(),
  unit: z.string().max(60).optional(),
  sales_volume: z.number().int().nonnegative().nullable().optional(),
  supplier_name: z.string().max(300).nullable().optional(),
  seller_login_id: z.string().max(200).nullable().optional(),
  seller_user_id: z.string().max(200).nullable().optional(),
  seller_store_url: SourceUrlSchema.nullable().optional(),
  specs: z.union([z.array(CommercialRecordSchema).max(500), CommercialRecordSchema]).optional(),
  pack_info: z.array(CommercialRecordSchema).max(500).default([]),
  sku_attrs: z.array(z.unknown()).max(500).default([]),
  sku_list: z.array(z.unknown()).max(2_000).default([]),
  price_tiers: z.array(PriceTierV1Schema).max(500).default([]),
  total_found: z.number().int().nonnegative().optional(),
}).passthrough();

export type SourcingExtensionV1Product = z.infer<typeof SourcingExtensionV1ProductSchema>;
