import { z } from 'zod';
import { zIsoDate } from './common.js';

export const COUPANG_CATALOG_COLLECTOR_VERSION = 'wing-inventory-v1';
export const COUPANG_CATALOG_BROWSER_FILE_NAME = 'browser-extension:coupang-wing:v1';
export const COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT = 500;
export const COUPANG_CATALOG_MAX_MEDIA_PER_OWNER = 100;
export const COUPANG_CATALOG_MAX_PRODUCTS_PER_CHUNK = 20;
export const COUPANG_CATALOG_MAX_PRODUCT_BYTES = 512 * 1024;
export const COUPANG_CATALOG_MAX_RAW_BYTES = 64 * 1024;
export const COUPANG_CATALOG_MAX_CHUNK_BYTES = 1024 * 1024;

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

export const CoupangCatalogAttributeV1Schema = z.object({
  type: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(2_000),
});
export type CoupangCatalogAttributeV1 = z.infer<typeof CoupangCatalogAttributeV1Schema>;

export const CoupangCatalogOptionV1Schema = z.object({
  externalOptionId: ExternalIdSchema,
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

export const CoupangCatalogDiscoveryItemV1Schema = z.object({
  ordinal: z.number().int().nonnegative(),
  externalProductId: ExternalIdSchema,
  registeredName: NullableTextSchema,
  primaryImageUrl: HttpUrlSchema.nullable(),
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
  'product_details',
  'manifest_confirmation',
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
    kind: z.literal('manifest_confirmation'),
    payload: CoupangCatalogManifestConfirmationV1Schema,
  }),
]).superRefine((request, ctx) => {
  const expectedCount = request.kind === 'product_details'
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
  const expectedSequence = request.kind === 'product_details'
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
  clientRunKey: z.string().uuid(),
  collectorVersion: z.string().trim().min(1).max(100),
});
export type StartCoupangCatalogCollectionRequest = z.infer<
  typeof StartCoupangCatalogCollectionRequestSchema
>;

export const CoupangCatalogCollectionErrorRequestSchema = z.object({
  code: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(1_000),
  phase: z.enum(['discovery', 'hydration', 'ready_to_finalize', 'publishing']),
});
export type CoupangCatalogCollectionErrorRequest = z.infer<
  typeof CoupangCatalogCollectionErrorRequestSchema
>;

export const CoupangCatalogCollectionStatusSchema = z.enum(['running', 'completed', 'failed']);
export const CoupangCatalogCollectionPhaseSchema = z.enum([
  'discovery',
  'hydration',
  'ready_to_finalize',
  'publishing',
  'finished',
]);
export type CoupangCatalogCollectionPhase = z.infer<
  typeof CoupangCatalogCollectionPhaseSchema
>;

export const CoupangCatalogCollectionRunSchema = z.object({
  id: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  clientRunKey: z.string().uuid(),
  status: CoupangCatalogCollectionStatusSchema,
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
  }).nullable(),
  publication: z.object({
    sourceImportRunId: z.string().uuid(),
    duplicate: z.boolean(),
    changes: z.record(z.number().int().nonnegative()),
  }).nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
  finishedAt: zIsoDate.nullable(),
});
export type CoupangCatalogCollectionRun = z.infer<typeof CoupangCatalogCollectionRunSchema>;

export const FinalizeCoupangCatalogCollectionRequestSchema = z.object({
  snapshotHash: Sha256Schema,
});
export type FinalizeCoupangCatalogCollectionRequest = z.infer<
  typeof FinalizeCoupangCatalogCollectionRequestSchema
>;

export const CoupangCatalogBrowserCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('startCoupangCatalogImport'),
    channelAccountId: z.string().uuid(),
    runId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('getCoupangCatalogImportStatus'),
    runId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('cancelCoupangCatalogImport'),
    runId: z.string().uuid(),
  }),
]);
export type CoupangCatalogBrowserCommand = z.infer<typeof CoupangCatalogBrowserCommandSchema>;

export const CoupangCatalogBrowserStatusSchema = z.object({
  runId: z.string().uuid(),
  status: z.enum(['idle', 'running', 'done', 'error', 'cancelled']),
  phase: CoupangCatalogCollectionPhaseSchema.optional(),
  currentPage: z.number().int().nonnegative().optional(),
  totalPages: z.number().int().nonnegative().optional(),
  hydratedProducts: z.number().int().nonnegative().optional(),
  discoveredProducts: z.number().int().nonnegative().optional(),
  uploadedChunks: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});
export type CoupangCatalogBrowserStatus = z.infer<typeof CoupangCatalogBrowserStatusSchema>;
