import { z } from 'zod';
import { SourcingOperationResultSchema } from './operation-result.js';

const BoundedCountSchema = z.number().int().nonnegative().max(2_147_483_647);
const InstantSchema = z.string().datetime({ offset: true });
const NullableBoundedTextSchema = z.string().trim().max(500).nullable();
const NullableMetricSchema = z.number().finite().nonnegative().max(2_147_483_647).nullable();

export const SOURCING_WING_CATALOG_KEYWORD_CONTRACT_VERSION =
  'nfkc-collapse-casefold-v1';
export const SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY =
  'coupang.keyword_suggestion';
export const SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION =
  'coupang-keyword-suggestion/v1';

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

export const SourcingKeywordSuggestionInputSchema = z
  .object({
    keyword: SourcingWingCatalogKeywordSchema,
    maxResults: z.number().int().min(1).max(30),
  })
  .strict();

export const SourcingKeywordSuggestionItemSchema = z
  .object({
    rank: z.number().int().min(1).max(30),
    keyword: SourcingWingCatalogKeywordSchema,
    source: z.enum(['coupang-autocomplete', 'coupang-search-dom']),
  })
  .strict();

export const SourcingKeywordSuggestionTokenSchema = z
  .object({
    keyword: SourcingWingCatalogKeywordSchema,
    count: z.number().int().min(1).max(2_147_483_647),
  })
  .strict();

export const SourcingKeywordSuggestionObservationBatchSchema = z
  .object({
    keyword: SourcingWingCatalogKeywordSchema,
    capturedAt: InstantSchema,
    items: z.array(SourcingKeywordSuggestionItemSchema).max(30),
    productNameTokens: z.array(SourcingKeywordSuggestionTokenSchema).max(30),
  })
  .strict();

export const SourcingKeywordSuggestionSnapshotSchema = z
  .object({
    keyword: SourcingWingCatalogKeywordSchema,
    generatedAt: InstantSchema.nullable(),
    sourceKey: z.literal(SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY),
    schemaVersion: z.literal(SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION),
    items: z.array(SourcingKeywordSuggestionItemSchema).max(30),
    productNameTokens: z.array(SourcingKeywordSuggestionTokenSchema).max(30),
  })
  .strict();

const CoupangSellerIdSchema = z.string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/u);

const AdvertisingCompetitorCatalogProductSchema = z
  .object({
    sourceRank: z.number().int().min(1).max(100),
    productId: z.string().trim().min(1).max(200).nullable(),
    itemId: z.string().trim().min(1).max(200).nullable(),
    vendorItemId: z.string().trim().min(1).max(200).nullable(),
    name: z.string().trim().min(1).max(500),
    priceKrw: BoundedCountSchema.nullable(),
    reviewCount: BoundedCountSchema.nullable(),
    imageUrl: z.string().trim().max(2_000).nullable(),
    link: z.string().trim().max(2_000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.productId && !value.itemId && !value.vendorItemId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['productId'],
        message: 'A competitor catalog product requires an exact identity.',
      });
    }
  });

const CoupangSellerStoreUrlSchema = z.string()
  .trim()
  .url()
  .max(2_000)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' && parsed.hostname === 'shop.coupang.com';
    } catch {
      return false;
    }
  }, 'Only Coupang seller-store URLs are accepted as catalog evidence.');

export const AdvertisingCompetitorCatalogItemSchema = z
  .object({
    keyword: SourcingWingCatalogKeywordSchema,
    sellerId: CoupangSellerIdSchema,
    sellerName: z.string().trim().min(1).max(300),
    sellerStoreUrl: CoupangSellerStoreUrlSchema,
    totalProductCount: BoundedCountSchema.nullable(),
    collectedProductCount: z.number().int().min(1).max(100),
    isTruncated: z.boolean(),
    sort: z.literal('newest'),
    capturedAt: InstantSchema,
    products: z.array(AdvertisingCompetitorCatalogProductSchema).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.collectedProductCount !== value.products.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['collectedProductCount'],
        message: 'Collected product count must match the bounded rows.',
      });
    }
  });

export const AdvertisingCompetitorCatalogBatchSchema = z
  .object({
    catalogs: z.array(AdvertisingCompetitorCatalogItemSchema).min(1).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    const sellers = new Set<string>();
    value.catalogs.forEach((catalog, index) => {
      if (sellers.has(catalog.sellerId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['catalogs', index, 'sellerId'],
          message: 'Competitor seller IDs must be unique per owner batch.',
        });
      }
      sellers.add(catalog.sellerId);
    });
  });

export const AdvertisingTrackedWingProductsInputSchema = z
  .object({
    keywords: z.array(SourcingWingCatalogKeywordSchema).min(1).max(12),
    maxPages: z.number().int().min(1).max(5),
    purpose: z.literal('tracked_metrics'),
    trackedProductIds: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
  })
  .strict()
  .superRefine((value, context) => {
    const keywordIdentities = new Set<string>();
    value.keywords.forEach((keyword, index) => {
      const identity = sourcingWingCatalogKeywordIdentity(keyword);
      if (keywordIdentities.has(identity)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['keywords', index],
          message: 'Wing catalog keywords must be unique after normalization.',
        });
      }
      keywordIdentities.add(identity);
    });
    const productIds = new Set<string>();
    value.trackedProductIds.forEach((productId, index) => {
      if (productIds.has(productId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['trackedProductIds', index],
          message: 'Tracked product IDs must be unique.',
        });
      }
      productIds.add(productId);
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
    generatedAt: InstantSchema.nullable(),
    items: z.array(SourcingWingCatalogObservationSchema).max(400),
    rejectedCount: BoundedCountSchema,
  })
  .strict();

export type SourcingWingCatalogPurpose = z.infer<
  typeof SourcingWingCatalogPurposeSchema
>;
export type SourcingKeywordSuggestionInput = z.infer<
  typeof SourcingKeywordSuggestionInputSchema
>;
export type SourcingKeywordSuggestionItem = z.infer<
  typeof SourcingKeywordSuggestionItemSchema
>;
export type SourcingKeywordSuggestionToken = z.infer<
  typeof SourcingKeywordSuggestionTokenSchema
>;
export type SourcingKeywordSuggestionObservationBatch = z.infer<
  typeof SourcingKeywordSuggestionObservationBatchSchema
>;
export type SourcingKeywordSuggestionSnapshot = z.infer<
  typeof SourcingKeywordSuggestionSnapshotSchema
>;
export type AdvertisingCompetitorCatalogItem = z.infer<
  typeof AdvertisingCompetitorCatalogItemSchema
>;
export type AdvertisingCompetitorCatalogBatch = z.infer<
  typeof AdvertisingCompetitorCatalogBatchSchema
>;
export type SourcingWingCatalogBatchInput = z.infer<
  typeof SourcingWingCatalogBatchInputSchema
>;
export type AdvertisingTrackedWingProductsInput = z.infer<
  typeof AdvertisingTrackedWingProductsInputSchema
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
