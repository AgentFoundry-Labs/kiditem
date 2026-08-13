import { z } from 'zod';
import { SourcingOperationResultSchema } from './operation-result.js';

const BoundedCountSchema = z.number().int().nonnegative().max(2_147_483_647);
const InstantSchema = z.string().datetime({ offset: true });
const NullableBoundedTextSchema = z.string().trim().max(500).nullable();
const NullableMetricSchema = z.number().finite().nonnegative().max(2_147_483_647).nullable();

export const SOURCING_WING_CATALOG_KEYWORD_CONTRACT_VERSION =
  'nfkc-collapse-casefold-v1';

export function canonicalizeSourcingWingCatalogKeyword(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function sourcingWingCatalogKeywordIdentity(value: string): string {
  return canonicalizeSourcingWingCatalogKeyword(value).toLocaleLowerCase('en-US');
}

export const SourcingWingCatalogKeywordSchema = z.string()
  .transform(canonicalizeSourcingWingCatalogKeyword)
  .pipe(z.string().min(1).max(100));

export const SourcingWingCatalogPurposeSchema = z.enum([
  'catalog_search',
  'market_analysis',
  'recommendation_validation',
  'tracked_metrics',
]);

export const SourcingWingCatalogBatchInputSchema = z
  .object({
    keywords: z.array(SourcingWingCatalogKeywordSchema).min(1).max(12),
    maxPages: z.number().int().min(1).max(5),
    purpose: SourcingWingCatalogPurposeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const identities = new Set<string>();
    value.keywords.forEach((keyword, index) => {
      const identity = sourcingWingCatalogKeywordIdentity(keyword);
      if (identities.has(identity)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['keywords', index],
          message: 'Wing catalog keywords must be unique after normalization.',
        });
      }
      identities.add(identity);
    });
  });

export const SourcingWingCatalogObservationSchema = z
  .object({
    productId: z.string().trim().min(1).max(200),
    itemId: z.string().trim().max(200).nullable(),
    vendorItemId: z.string().trim().max(200).nullable(),
    productName: z.string().trim().min(1).max(500),
    itemName: NullableBoundedTextSchema,
    brandName: NullableBoundedTextSchema,
    manufacture: NullableBoundedTextSchema,
    categoryHierarchy: z.string().trim().max(1_000).nullable(),
    imagePath: z.string().trim().max(2_000).nullable(),
    salePriceKrw: BoundedCountSchema.nullable(),
    ratingAverage: z.number().finite().min(0).max(5).nullable(),
    ratingCount: BoundedCountSchema.nullable(),
    viewsLast28d: BoundedCountSchema.nullable(),
    salesLast28d: BoundedCountSchema.nullable(),
    estimatedRevenue28d: NullableMetricSchema,
    conversionRate28d: z.number().finite().min(0).max(1).nullable(),
    deliveryInfo: z.string().trim().max(1_000).nullable(),
    sourceKeyword: SourcingWingCatalogKeywordSchema,
    capturedAt: InstantSchema,
  })
  .strict();

export const SourcingWingCatalogObservationBatchSchema = z
  .object({
    keyword: SourcingWingCatalogKeywordSchema,
    maxPages: z.number().int().min(1).max(5),
    purpose: SourcingWingCatalogPurposeSchema,
    items: z.array(SourcingWingCatalogObservationSchema).max(100),
  })
  .strict();

export const SourcingWingCatalogKeywordResultSchema = z
  .object({
    keyword: SourcingWingCatalogKeywordSchema,
    outcome: z.enum(['complete', 'no_change', 'failed']),
    discovered: BoundedCountSchema,
    accepted: BoundedCountSchema,
    duplicate: BoundedCountSchema,
    failed: BoundedCountSchema,
    errorCode: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const SourcingWingCatalogFinalizeSchema = z
  .object({
    purpose: SourcingWingCatalogPurposeSchema,
    keywords: z.array(SourcingWingCatalogKeywordResultSchema).min(1).max(12),
  })
  .strict();

export const SourcingWingCatalogBatchResultSchema =
  SourcingOperationResultSchema.extend({
    keywords: z.array(SourcingWingCatalogKeywordResultSchema).min(1).max(12),
  }).strict();

export const SourcingWingCatalogSnapshotSchema = z
  .object({
    keyword: SourcingWingCatalogKeywordSchema,
    generatedAt: InstantSchema,
    items: z.array(SourcingWingCatalogObservationSchema).max(400),
    rejectedCount: BoundedCountSchema,
  })
  .strict();

export type SourcingWingCatalogPurpose = z.infer<
  typeof SourcingWingCatalogPurposeSchema
>;
export type SourcingWingCatalogBatchInput = z.infer<
  typeof SourcingWingCatalogBatchInputSchema
>;
export type SourcingWingCatalogObservation = z.infer<
  typeof SourcingWingCatalogObservationSchema
>;
export type SourcingWingCatalogObservationBatch = z.infer<
  typeof SourcingWingCatalogObservationBatchSchema
>;
export type SourcingWingCatalogKeywordResult = z.infer<
  typeof SourcingWingCatalogKeywordResultSchema
>;
export type SourcingWingCatalogFinalize = z.infer<
  typeof SourcingWingCatalogFinalizeSchema
>;
export type SourcingWingCatalogBatchResult = z.infer<
  typeof SourcingWingCatalogBatchResultSchema
>;
export type SourcingWingCatalogSnapshot = z.infer<
  typeof SourcingWingCatalogSnapshotSchema
>;
