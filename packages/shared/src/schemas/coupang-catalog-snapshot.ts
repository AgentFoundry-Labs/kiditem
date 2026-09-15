import { z } from 'zod';
import { zIsoDate } from './common.js';
import { BrowserCollectionAttentionSchema } from './browser-collection-session.js';

export const COUPANG_CATALOG_COLLECTOR_VERSION = 'wing-inventory-v1';
export const COUPANG_CATALOG_BROWSER_FILE_NAME = 'browser-extension:coupang-wing:v1';
export const COUPANG_CATALOG_BASIC_SOURCE_TYPE = 'coupang_wing_catalog_basics';
export const COUPANG_CATALOG_DETAILS_SOURCE_TYPE = 'coupang_wing_catalog_details';
export const COUPANG_CATALOG_STAGE_SCHEMA_VERSION = 1;
export const COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT = 500;
export const COUPANG_CATALOG_MAX_MEDIA_PER_OWNER = 100;
const COUPANG_CATALOG_MAX_DETAIL_MEDIA =
  COUPANG_CATALOG_MAX_MEDIA_PER_OWNER * (COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT + 1);
export const COUPANG_CATALOG_MAX_PRODUCTS_PER_CHUNK = 20;
export const COUPANG_CATALOG_MAX_PRODUCT_BYTES = 512 * 1024;
export const COUPANG_CATALOG_MAX_RAW_BYTES = 64 * 1024;
export const COUPANG_CATALOG_MAX_CHUNK_BYTES = 1024 * 1024;
export const COUPANG_CATALOG_MAX_DOCUMENT_BYTES = 64 * 1024;
export const COUPANG_CATALOG_MAX_DOCUMENTS_PER_PRODUCT = 2_000;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const ExternalIdSchema = z.string().trim().min(1).max(200);
const NullableTextSchema = z.string().trim().min(1).max(2_000).nullable();
const HttpUrlSchema = z.string().url().max(4_096).refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'Provider URL must use HTTP(S)');

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen))
    : Object.entries(value as Record<string, unknown>).every(([key, nested]) =>
      key !== '__proto__' && key !== 'prototype' && isJsonValue(nested, seen));
  seen.delete(value);
  return valid;
}

function addDuplicateIssue(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  field: string,
  value: string,
): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: `duplicate ${field}: ${value}`,
  });
}

export const CoupangCatalogMediaRoleSchema = z.enum(['primary', 'detail', 'option']);
export type CoupangCatalogMediaRole = z.infer<typeof CoupangCatalogMediaRoleSchema>;

export const CoupangCatalogMediaV1Schema = z.object({
  sourceUrl: HttpUrlSchema,
  role: CoupangCatalogMediaRoleSchema,
  sortOrder: z.number().int().nonnegative(),
  externalOptionId: ExternalIdSchema.nullable(),
});
export type CoupangCatalogMediaV1 = z.infer<typeof CoupangCatalogMediaV1Schema>;

/**
 * Detail media is normalized by URL and role.  The optional association list
 * keeps one provider image from being flattened into one row per option.  The
 * legacy single-owner field remains accepted while old extension receipts are
 * being drained.
 */
export const CoupangCatalogDetailMediaV1Schema = z.object({
  sourceUrl: HttpUrlSchema,
  role: CoupangCatalogMediaRoleSchema,
  sortOrder: z.number().int().nonnegative(),
  externalOptionIds: z.array(ExternalIdSchema)
    .max(COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT)
    .optional(),
  externalOptionId: ExternalIdSchema.nullable().optional(),
}).superRefine((media, ctx) => {
  const ids = media.externalOptionIds ?? [];
  if (media.externalOptionId && ids.length > 0 && !ids.includes(media.externalOptionId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['externalOptionId'],
      message: 'legacy externalOptionId must be present in externalOptionIds',
    });
  }
});
export type CoupangCatalogDetailMediaV1 = z.infer<typeof CoupangCatalogDetailMediaV1Schema>;

export const CoupangCatalogAttributeV1Schema = z.object({
  type: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(2_000),
});
export type CoupangCatalogAttributeV1 = z.infer<typeof CoupangCatalogAttributeV1Schema>;

export const CoupangCatalogOptionV1Schema = z.object({
  externalOptionId: ExternalIdSchema,
  // `vendorItemId` is nullable in Wing inventory responses.  A typed
  // sellerProductItemId may still be used as the stable external option key,
  // but it must not be relabelled as a vendorItemId by the collector.
  vendorItemId: ExternalIdSchema.nullable().optional(),
  vendorInventoryItemId: ExternalIdSchema.nullable().optional(),
  sellerProductItemId: ExternalIdSchema.nullable().optional(),
  skuId: ExternalIdSchema.nullable().optional(),
  externalSkuCode: NullableTextSchema.optional(),
  stock: z.number().int().nonnegative().nullable().optional(),
  stockQuantity: z.number().int().nonnegative().nullable().optional(),
  soldOut: z.boolean().nullable().optional(),
  optionName: NullableTextSchema,
  skuStatus: NullableTextSchema,
  salePrice: z.number().int().nonnegative().nullable(),
  sellerSku: NullableTextSchema,
  modelNumber: NullableTextSchema,
  barcode: NullableTextSchema,
  attributes: z.array(CoupangCatalogAttributeV1Schema).max(100),
  media: z.array(CoupangCatalogMediaV1Schema).max(COUPANG_CATALOG_MAX_MEDIA_PER_OWNER),
  raw: z.record(z.unknown()),
}).superRefine((option, ctx) => {
  option.media.forEach((item, index) => {
    if (item.externalOptionId !== null && item.externalOptionId !== option.externalOptionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['media', index, 'externalOptionId'],
        message: 'media externalOptionId must match its option owner',
      });
    }
  });
  if (jsonBytes(option.raw) > COUPANG_CATALOG_MAX_RAW_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['raw'],
      message: `option raw diagnostics exceed ${COUPANG_CATALOG_MAX_RAW_BYTES} bytes`,
    });
  }
});
export type CoupangCatalogOptionV1 = z.infer<typeof CoupangCatalogOptionV1Schema>;

export const CoupangCatalogProductV1Schema = z.object({
  externalProductId: ExternalIdSchema,
  registeredName: NullableTextSchema,
  displayName: NullableTextSchema,
  category: NullableTextSchema,
  manufacturer: NullableTextSchema,
  brand: NullableTextSchema,
  productStatus: NullableTextSchema,
  options: z.array(CoupangCatalogOptionV1Schema)
    .min(1)
    .max(COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT),
  media: z.array(CoupangCatalogMediaV1Schema).max(COUPANG_CATALOG_MAX_MEDIA_PER_OWNER),
  raw: z.record(z.unknown()),
}).superRefine((product, ctx) => {
  const optionIds = new Set<string>();
  product.options.forEach((option, index) => {
    if (optionIds.has(option.externalOptionId)) {
      addDuplicateIssue(ctx, ['options', index, 'externalOptionId'], 'externalOptionId', option.externalOptionId);
    }
    optionIds.add(option.externalOptionId);
  });
  product.media.forEach((item, index) => {
    if (item.externalOptionId !== null && !optionIds.has(item.externalOptionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['media', index, 'externalOptionId'],
        message: `media references unknown option: ${item.externalOptionId}`,
      });
    }
  });
  if (jsonBytes(product.raw) > COUPANG_CATALOG_MAX_RAW_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['raw'],
      message: `raw diagnostics exceed ${COUPANG_CATALOG_MAX_RAW_BYTES} bytes`,
    });
  }
  if (jsonBytes(product) > COUPANG_CATALOG_MAX_PRODUCT_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `product exceeds ${COUPANG_CATALOG_MAX_PRODUCT_BYTES} bytes`,
    });
  }
});
export type CoupangCatalogProductV1 = z.infer<typeof CoupangCatalogProductV1Schema>;

export const CoupangCatalogStageSchema = z.enum(['full', 'basics', 'details']);
export type CoupangCatalogStage = z.infer<typeof CoupangCatalogStageSchema>;

/** The complete provider listing row used by the first (basic) stage. */
export const CoupangCatalogBasicOptionV1Schema = CoupangCatalogOptionV1Schema;
export type CoupangCatalogBasicOptionV1 = z.infer<typeof CoupangCatalogBasicOptionV1Schema>;

export const CoupangCatalogBasicProductV1Schema = z.object({
  externalProductId: ExternalIdSchema,
  registeredName: NullableTextSchema,
  displayName: NullableTextSchema,
  category: NullableTextSchema,
  manufacturer: NullableTextSchema,
  brand: NullableTextSchema,
  productStatus: NullableTextSchema,
  options: z.array(CoupangCatalogBasicOptionV1Schema)
    .min(1)
    .max(COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT),
  media: z.array(CoupangCatalogMediaV1Schema).max(COUPANG_CATALOG_MAX_MEDIA_PER_OWNER),
  raw: z.record(z.unknown()),
}).superRefine((product, ctx) => {
  const optionIds = new Set<string>();
  product.options.forEach((option, index) => {
    if (optionIds.has(option.externalOptionId)) {
      addDuplicateIssue(ctx, ['options', index, 'externalOptionId'], 'externalOptionId', option.externalOptionId);
    }
    optionIds.add(option.externalOptionId);
  });
  product.media.forEach((item, index) => {
    if (item.externalOptionId !== null && !optionIds.has(item.externalOptionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['media', index, 'externalOptionId'],
        message: `media references unknown option: ${item.externalOptionId}`,
      });
    }
  });
  if (jsonBytes(product.raw) > COUPANG_CATALOG_MAX_RAW_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['raw'],
      message: `basic raw diagnostics exceed ${COUPANG_CATALOG_MAX_RAW_BYTES} bytes`,
    });
  }
  if (jsonBytes(product) > COUPANG_CATALOG_MAX_PRODUCT_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `basic product exceeds ${COUPANG_CATALOG_MAX_PRODUCT_BYTES} bytes`,
    });
  }
});
export type CoupangCatalogBasicProductV1 = z.infer<typeof CoupangCatalogBasicProductV1Schema>;

// Provider detail objects contain additionalNotices, internalAttributes,
// certifications and extraProperties as well.  Keep the source field name
// rather than inventing a domain enum so an unrecognised provider field is not
// silently discarded during a later collector revision.
export const CoupangCatalogDetailDocumentKindSchema = z.enum([
  'contents',
  'notices',
  'additionalNotices',
  'searchTags',
  'attributes',
  'internalAttributes',
  'certifications',
  'extraProperties',
]);
export type CoupangCatalogDetailDocumentKind = z.infer<
  typeof CoupangCatalogDetailDocumentKindSchema
>;

const CoupangCatalogDetailDocumentValueSchema = z.unknown().superRefine((value, ctx) => {
  if (!isJsonValue(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'detail document value must be finite JSON and must preserve explicit null',
    });
    return;
  }
  if (jsonBytes(value) > COUPANG_CATALOG_MAX_DOCUMENT_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `detail document exceeds ${COUPANG_CATALOG_MAX_DOCUMENT_BYTES} bytes`,
    });
  }
});

export const CoupangCatalogDetailDocumentV1Schema = z.object({
  id: ExternalIdSchema,
  kind: CoupangCatalogDetailDocumentKindSchema,
  value: CoupangCatalogDetailDocumentValueSchema,
});
export type CoupangCatalogDetailDocumentV1 = z.infer<
  typeof CoupangCatalogDetailDocumentV1Schema
>;

export const CoupangCatalogDetailOptionV1Schema = z.object({
  externalOptionId: ExternalIdSchema,
  vendorItemId: ExternalIdSchema.nullable().optional(),
  sellerProductItemId: ExternalIdSchema.nullable().optional(),
  externalVendorSku: NullableTextSchema.optional(),
  barcode: NullableTextSchema.optional(),
  modelNumber: NullableTextSchema.optional(),
  attributes: z.array(CoupangCatalogAttributeV1Schema).max(100).optional(),
  documentIds: z.array(ExternalIdSchema).max(COUPANG_CATALOG_MAX_DOCUMENTS_PER_PRODUCT),
  raw: z.record(z.unknown()).optional(),
});
export type CoupangCatalogDetailOptionV1 = z.infer<typeof CoupangCatalogDetailOptionV1Schema>;

export const CoupangCatalogDetailProductV1Schema = z.object({
  externalProductId: ExternalIdSchema,
  options: z.array(CoupangCatalogDetailOptionV1Schema)
    .min(1)
    .max(COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT),
  documents: z.array(CoupangCatalogDetailDocumentV1Schema)
    .max(COUPANG_CATALOG_MAX_DOCUMENTS_PER_PRODUCT),
  media: z.array(CoupangCatalogDetailMediaV1Schema).max(COUPANG_CATALOG_MAX_DETAIL_MEDIA),
  raw: z.record(z.unknown()),
}).superRefine((product, ctx) => {
  const optionIds = new Set<string>();
  for (const [index, option] of product.options.entries()) {
    if (optionIds.has(option.externalOptionId)) {
      addDuplicateIssue(
        ctx,
        ['options', index, 'externalOptionId'],
        'externalOptionId',
        option.externalOptionId,
      );
    }
    optionIds.add(option.externalOptionId);
  }
  const documentsById = new Map<string, CoupangCatalogDetailDocumentV1>();
  for (const [index, document] of product.documents.entries()) {
    const previous = documentsById.get(document.id);
    if (previous) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documents', index, 'id'],
        message: `duplicate detail document id: ${document.id}`,
      });
    } else {
      documentsById.set(document.id, document);
    }
    if (previous && stableDocumentValue(previous) !== stableDocumentValue(document)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documents', index, 'value'],
        message: `detail document id maps to more than one value: ${document.id}`,
      });
    }
  }
  const documentValues = new Set<string>();
  for (const document of product.documents) {
    const key = `${document.kind}\u0000${stableDocumentValue(document.value)}`;
    if (documentValues.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documents'],
        message: 'detail documents must be deduplicated by kind and value',
      });
    }
    documentValues.add(key);
  }
  for (const [index, option] of product.options.entries()) {
    for (const [documentIndex, documentId] of option.documentIds.entries()) {
      if (!documentsById.has(documentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options', index, 'documentIds', documentIndex],
          message: `option references unknown detail document: ${documentId}`,
        });
      }
    }
  }
  const mediaCountByOption = new Map<string, number>();
  let unassociatedMediaCount = 0;
  for (const [index, media] of product.media.entries()) {
    const optionRefs = new Set<string>(
      media.externalOptionIds ??
        (media.externalOptionId ? [media.externalOptionId] : []),
    );
    if (optionRefs.size === 0) {
      unassociatedMediaCount += 1;
      continue;
    }
    for (const optionId of optionRefs) {
      if (!optionIds.has(optionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['media', index, 'externalOptionIds'],
          message: `media references unknown option: ${optionId}`,
        });
      } else {
        mediaCountByOption.set(
          optionId,
          (mediaCountByOption.get(optionId) ?? 0) + 1,
        );
      }
    }
  }
  for (const [optionId, count] of mediaCountByOption.entries()) {
    if (count > COUPANG_CATALOG_MAX_MEDIA_PER_OWNER) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['media'],
        message: 'media exceeds ' + COUPANG_CATALOG_MAX_MEDIA_PER_OWNER +
          ' references for option: ' + optionId,
      });
    }
  }
  if (unassociatedMediaCount > COUPANG_CATALOG_MAX_MEDIA_PER_OWNER) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['media'],
      message: 'unassociated media exceeds ' + COUPANG_CATALOG_MAX_MEDIA_PER_OWNER,
    });
  }
  if (jsonBytes(product.raw) > COUPANG_CATALOG_MAX_RAW_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['raw'],
      message: `detail raw diagnostics exceed ${COUPANG_CATALOG_MAX_RAW_BYTES} bytes`,
    });
  }
  if (jsonBytes(product) > COUPANG_CATALOG_MAX_PRODUCT_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `detail product exceeds ${COUPANG_CATALOG_MAX_PRODUCT_BYTES} bytes`,
    });
  }
});
export type CoupangCatalogDetailProductV1 = z.infer<typeof CoupangCatalogDetailProductV1Schema>;

export const CoupangCatalogListingBasicsChunkV1Schema = z.object({
  version: z.literal(COUPANG_CATALOG_STAGE_SCHEMA_VERSION),
  kind: z.literal('listing_basics'),
  startOrdinal: z.number().int().nonnegative(),
  products: z.array(z.object({
    ordinal: z.number().int().nonnegative(),
    product: CoupangCatalogBasicProductV1Schema,
  })).min(1).max(COUPANG_CATALOG_MAX_PRODUCTS_PER_CHUNK),
}).superRefine((chunk, ctx) => {
  chunk.products.forEach((item, index) => {
    if (item.ordinal !== chunk.startOrdinal + index) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['products', index, 'ordinal'],
        message: `product ordinals must be contiguous from ${chunk.startOrdinal}`,
      });
    }
  });
  if (jsonBytes(chunk) > COUPANG_CATALOG_MAX_CHUNK_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `chunk exceeds ${COUPANG_CATALOG_MAX_CHUNK_BYTES} bytes`,
    });
  }
});
export type CoupangCatalogListingBasicsChunkV1 = z.infer<
  typeof CoupangCatalogListingBasicsChunkV1Schema
>;

export const CoupangCatalogFullDetailsChunkV1Schema = z.object({
  version: z.literal(COUPANG_CATALOG_STAGE_SCHEMA_VERSION),
  kind: z.literal('full_details'),
  startOrdinal: z.number().int().nonnegative(),
  products: z.array(z.object({
    ordinal: z.number().int().nonnegative(),
    product: CoupangCatalogDetailProductV1Schema,
  })).min(1).max(COUPANG_CATALOG_MAX_PRODUCTS_PER_CHUNK),
}).superRefine((chunk, ctx) => {
  chunk.products.forEach((item, index) => {
    if (item.ordinal !== chunk.startOrdinal + index) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['products', index, 'ordinal'],
        message: `product ordinals must be contiguous from ${chunk.startOrdinal}`,
      });
    }
  });
  if (jsonBytes(chunk) > COUPANG_CATALOG_MAX_CHUNK_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `chunk exceeds ${COUPANG_CATALOG_MAX_CHUNK_BYTES} bytes`,
    });
  }
});
export type CoupangCatalogFullDetailsChunkV1 = z.infer<
  typeof CoupangCatalogFullDetailsChunkV1Schema
>;

function stableDocumentValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableDocumentValue).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableDocumentValue(nested)}`)
    .join(',')}}`;
}

export const CoupangCatalogManifestV1Schema = z.object({
  totalItems: z.number().int().positive(),
  pageSize: z.number().int().positive().max(500),
  expectedPages: z.number().int().positive(),
  firstPageFingerprint: Sha256Schema,
}).superRefine((manifest, ctx) => {
  const expected = Math.ceil(manifest.totalItems / manifest.pageSize);
  if (manifest.expectedPages !== expected) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedPages'],
      message: `expectedPages must equal ceil(totalItems/pageSize): ${expected}`,
    });
  }
});
export type CoupangCatalogManifestV1 = z.infer<typeof CoupangCatalogManifestV1Schema>;

export const CoupangCatalogDetailManifestConfirmationV1Schema = z.object({
  version: z.literal(COUPANG_CATALOG_STAGE_SCHEMA_VERSION),
  kind: z.literal('detail_manifest_confirmation'),
  manifest: CoupangCatalogManifestV1Schema,
  basicAttemptId: z.string().uuid(),
  basicManifestHash: Sha256Schema,
});
export type CoupangCatalogDetailManifestConfirmationV1 = z.infer<
  typeof CoupangCatalogDetailManifestConfirmationV1Schema
>;

export const CoupangCatalogDiscoveryItemV1Schema = z.object({
  ordinal: z.number().int().nonnegative(),
  externalProductId: ExternalIdSchema,
  registeredName: NullableTextSchema,
  primaryImageUrl: HttpUrlSchema.nullable(),
  saleStatus: NullableTextSchema.optional().default(null),
});
export type CoupangCatalogDiscoveryItemV1 = z.infer<typeof CoupangCatalogDiscoveryItemV1Schema>;

export const CoupangCatalogDiscoveryPageV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal('discovery_page'),
  page: z.number().int().positive(),
  manifest: CoupangCatalogManifestV1Schema,
  items: z.array(CoupangCatalogDiscoveryItemV1Schema).min(1).max(500),
}).superRefine((page, ctx) => {
  if (page.page > page.manifest.expectedPages) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['page'],
      message: 'page exceeds manifest expectedPages',
    });
  }
  const productIds = new Set<string>();
  const ordinals = new Set<number>();
  page.items.forEach((item, index) => {
    if (productIds.has(item.externalProductId)) {
      addDuplicateIssue(ctx, ['items', index, 'externalProductId'], 'externalProductId', item.externalProductId);
    }
    if (ordinals.has(item.ordinal)) {
      addDuplicateIssue(ctx, ['items', index, 'ordinal'], 'ordinal', String(item.ordinal));
    }
    productIds.add(item.externalProductId);
    ordinals.add(item.ordinal);
  });
});
export type CoupangCatalogDiscoveryPageV1 = z.infer<typeof CoupangCatalogDiscoveryPageV1Schema>;

export const CoupangCatalogProductDetailsChunkV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal('product_details'),
  startOrdinal: z.number().int().nonnegative(),
  products: z.array(z.object({
    ordinal: z.number().int().nonnegative(),
    product: CoupangCatalogProductV1Schema,
  })).min(1).max(COUPANG_CATALOG_MAX_PRODUCTS_PER_CHUNK),
}).superRefine((chunk, ctx) => {
  chunk.products.forEach((item, index) => {
    const expectedOrdinal = chunk.startOrdinal + index;
    if (item.ordinal !== expectedOrdinal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['products', index, 'ordinal'],
        message: `product ordinals must be contiguous from ${chunk.startOrdinal}`,
      });
    }
  });
  if (jsonBytes(chunk) > COUPANG_CATALOG_MAX_CHUNK_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `chunk exceeds ${COUPANG_CATALOG_MAX_CHUNK_BYTES} bytes`,
    });
  }
});
export type CoupangCatalogProductDetailsChunkV1 = z.infer<
  typeof CoupangCatalogProductDetailsChunkV1Schema
>;

export const CoupangCatalogManifestConfirmationV1Schema = z.object({
  version: z.literal(1),
  kind: z.literal('manifest_confirmation'),
  manifest: CoupangCatalogManifestV1Schema,
});
export type CoupangCatalogManifestConfirmationV1 = z.infer<
  typeof CoupangCatalogManifestConfirmationV1Schema
>;

export const CoupangCatalogChunkKindSchema = z.enum([
  'discovery_page',
  'listing_basics',
  'product_details',
  'full_details',
  'manifest_confirmation',
  'detail_manifest_confirmation',
]);
export type CoupangCatalogChunkKind = z.infer<typeof CoupangCatalogChunkKindSchema>;

const ChunkRequestBaseSchema = z.object({
  sequence: z.number().int().positive(),
  checksum: Sha256Schema,
  itemCount: z.number().int().nonnegative(),
});

export const PutCoupangCatalogChunkRequestSchema = z.discriminatedUnion('kind', [
  ChunkRequestBaseSchema.extend({
    kind: z.literal('discovery_page'),
    payload: CoupangCatalogDiscoveryPageV1Schema,
  }),
  ChunkRequestBaseSchema.extend({
    kind: z.literal('product_details'),
    payload: CoupangCatalogProductDetailsChunkV1Schema,
  }),
  ChunkRequestBaseSchema.extend({
    kind: z.literal('listing_basics'),
    payload: CoupangCatalogListingBasicsChunkV1Schema,
  }),
  ChunkRequestBaseSchema.extend({
    kind: z.literal('full_details'),
    payload: CoupangCatalogFullDetailsChunkV1Schema,
  }),
  ChunkRequestBaseSchema.extend({
    kind: z.literal('manifest_confirmation'),
    payload: CoupangCatalogManifestConfirmationV1Schema,
  }),
  ChunkRequestBaseSchema.extend({
    kind: z.literal('detail_manifest_confirmation'),
    payload: CoupangCatalogDetailManifestConfirmationV1Schema,
  }),
]).superRefine((request, ctx) => {
  const expectedCount = request.kind === 'product_details' || request.kind === 'listing_basics' || request.kind === 'full_details'
    ? request.payload.products.length
    : request.kind === 'discovery_page'
      ? request.payload.items.length
      : 1;
  if (request.itemCount !== expectedCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['itemCount'],
      message: `itemCount must equal payload count: ${expectedCount}`,
    });
  }
  const expectedSequence = request.kind === 'product_details' || request.kind === 'listing_basics' || request.kind === 'full_details'
    ? request.payload.startOrdinal + 1
    : request.kind === 'discovery_page'
      ? request.payload.page
      : 1;
  if (request.sequence !== expectedSequence) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sequence'],
      message: `sequence must equal ${expectedSequence} for ${request.kind}`,
    });
  }
  if (jsonBytes(request.payload) > COUPANG_CATALOG_MAX_CHUNK_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['payload'],
      message: `payload exceeds ${COUPANG_CATALOG_MAX_CHUNK_BYTES} bytes`,
    });
  }
});
export type PutCoupangCatalogChunkRequest = z.infer<
  typeof PutCoupangCatalogChunkRequestSchema
>;

export const StartCoupangCatalogCollectionRequestSchema = z.object({
  collectorVersion: z.string().trim().min(1).max(100),
  stage: CoupangCatalogStageSchema.optional(),
  /**
   * Details is admitted by the internal basics-to-details handoff.  The
   * caller must pin the exact completed basics attempt; the owner rechecks
   * that basis inside its account transaction before creating the child.
   */
  expectedBasicAttemptId: z.string().uuid().optional(),
}).strict();
export type StartCoupangCatalogCollectionRequest = z.infer<
  typeof StartCoupangCatalogCollectionRequestSchema
>;

export const CoupangCatalogCollectionErrorRequestSchema = z.object({
  code: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(1_000),
  phase: z.enum(['discovery', 'hydration', 'ready_to_finalize']),
  recoverable: z.boolean().optional(),
  notBefore: zIsoDate.optional(),
});
export type CoupangCatalogCollectionErrorRequest = z.infer<
  typeof CoupangCatalogCollectionErrorRequestSchema
>;

/**
 * A provider rate-limit pause is a non-terminal owner mutation.  Keep this
 * request narrower than the terminal failure contract so clients cannot
 * accidentally turn a pause into an arbitrary recoverable state.
 */
export const CoupangCatalogCollectionPauseRequestSchema = z.object({
  code: z.literal('WING_PROVIDER_RATE_LIMITED'),
  message: z.string().trim().min(1).max(1_000),
  phase: z.literal('hydration'),
  recoverable: z.literal(true),
  notBefore: zIsoDate,
}).strict();
export type CoupangCatalogCollectionPauseRequest = z.infer<
  typeof CoupangCatalogCollectionPauseRequestSchema
>;

export const CoupangCatalogCollectionStatusSchema = z.enum(['RUNNING', 'COMPLETE', 'FAILED']);
export const CoupangCatalogCollectionPlanSchema = z.object({
  collectorVersion: z.string().min(1).max(100),
  stage: CoupangCatalogStageSchema.optional(),
  listUrl: z.string().url(),
  detailUrl: z.string().url(),
  channelAccountId: z.string().uuid(),
  vendorId: z.string().min(1),
  publicationRevision: z.string().regex(/^\d+$/),
  basicAttemptId: z.string().uuid().optional(),
  basicManifestHash: Sha256Schema.optional(),
  basicPublicationSequence: z.string().regex(/^\d+$/).optional(),
  basicProductIds: z.array(ExternalIdSchema).max(100_000).optional(),
  /** Stable non-secret root identity for a staged internal chain. */
  rootAttemptId: z.string().uuid().optional(),
  /** Preallocated by a basics owner; reused for every details admission retry. */
  detailsIdempotencyKey: z.string().uuid().optional(),
}).strict();
export type CoupangCatalogCollectionPlan = z.infer<typeof CoupangCatalogCollectionPlanSchema>;
export const CoupangCatalogCollectionPermitSchema = z.object({
  attemptId: z.string().uuid(),
  attemptToken: z.string().uuid(),
  state: CoupangCatalogCollectionStatusSchema,
  expiresAt: zIsoDate,
  plan: CoupangCatalogCollectionPlanSchema,
}).strict();
export type CoupangCatalogCollectionPermit = z.infer<typeof CoupangCatalogCollectionPermitSchema>;
export const CoupangCatalogCollectionPhaseSchema = z.enum([
  'discovery',
  'hydration',
  'ready_to_finalize',
  'finished',
]);
export type CoupangCatalogCollectionPhase = z.infer<
  typeof CoupangCatalogCollectionPhaseSchema
>;

export const CoupangCatalogCollectionRunSchema = z.object({
  attemptId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  state: CoupangCatalogCollectionStatusSchema,
  expiresAt: zIsoDate,
  plan: CoupangCatalogCollectionPlanSchema,
  phase: CoupangCatalogCollectionPhaseSchema,
  collectorVersion: z.string().min(1),
  manifest: CoupangCatalogManifestV1Schema.nullable(),
  progress: z.object({
    discoveryPagesStored: z.number().int().nonnegative(),
    discoveredProducts: z.number().int().nonnegative(),
    hydratedProducts: z.number().int().nonnegative(),
    optionCount: z.number().int().nonnegative(),
    mediaCount: z.number().int().nonnegative(),
    storedChunks: z.number().int().nonnegative(),
    publishedProducts: z.number().int().nonnegative(),
    publishedOptionCount: z.number().int().nonnegative(),
    publishedMediaCount: z.number().int().nonnegative(),
    publishedChunks: z.number().int().nonnegative(),
    firstPublishedAt: zIsoDate.nullable(),
    lastPublishedAt: zIsoDate.nullable(),
  }),
  missing: z.object({
    discoverySequences: z.array(z.number().int().positive()),
    productIds: z.array(ExternalIdSchema),
  }),
  snapshotHash: Sha256Schema.nullable(),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    phase: CoupangCatalogCollectionPhaseSchema,
    recoverable: z.boolean(),
    notBefore: zIsoDate.nullable().optional(),
  }).nullable(),
  publication: z.object({
    sourceImportRunId: z.string().uuid(),
    duplicate: z.boolean(),
    changes: z.record(z.number().int().nonnegative()),
  }).nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
  finishedAt: zIsoDate.nullable(),
  /** Whole-flow status is token-free and is stable across the internal handoff. */
  rootAttemptId: z.string().uuid().optional(),
  currentAttemptId: z.string().uuid().optional(),
  currentStage: CoupangCatalogStageSchema.optional(),
  overallState: CoupangCatalogCollectionStatusSchema.optional(),
});
export type CoupangCatalogCollectionRun = z.infer<typeof CoupangCatalogCollectionRunSchema>;

/**
 * An account's latest browser catalog import (KID-147). `latestAttempt` is the
 * root the import started with: its `overallState` is the whole import's state
 * and its id is what an operator stops. `detailsAttempt` is the details child
 * once the handoff admitted it.
 */
export const CoupangCatalogSourceStatusSchema = z.object({
  latestAttempt: CoupangCatalogCollectionRunSchema.nullable(),
  detailsAttempt: CoupangCatalogCollectionRunSchema.nullable(),
});
export type CoupangCatalogSourceStatus = z.infer<typeof CoupangCatalogSourceStatusSchema>;

export const FinalizeCoupangCatalogCollectionRequestSchema = z.object({
  snapshotHash: Sha256Schema,
});
export type FinalizeCoupangCatalogCollectionRequest = z.infer<
  typeof FinalizeCoupangCatalogCollectionRequestSchema
>;

export const CoupangCatalogBrowserStatusSchema = z.object({
  attemptId: z.string().uuid(),
  active: z.boolean(),
  attention: BrowserCollectionAttentionSchema.nullable(),
  phase: CoupangCatalogCollectionPhaseSchema.optional(),
  currentPage: z.number().int().nonnegative().optional(),
  totalPages: z.number().int().nonnegative().optional(),
  hydratedProducts: z.number().int().nonnegative().optional(),
  discoveredProducts: z.number().int().nonnegative().optional(),
  uploadedChunks: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  /** Whole-flow status; deliberately excludes attempt tokens. */
  rootAttemptId: z.string().uuid().optional(),
  currentAttemptId: z.string().uuid().optional(),
  currentStage: CoupangCatalogStageSchema.optional(),
}).strict();
export type CoupangCatalogBrowserStatus = z.infer<typeof CoupangCatalogBrowserStatusSchema>;
