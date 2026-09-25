import { z } from 'zod';

export const COUPANG_CATALOG_BASIC_SOURCE_TYPE = 'coupang_wing_catalog_basics';
export const COUPANG_CATALOG_DETAILS_SOURCE_TYPE = 'coupang_wing_catalog_details';
export const COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT = 500;
export const COUPANG_CATALOG_MAX_MEDIA_PER_OWNER = 100;
const COUPANG_CATALOG_MAX_DETAIL_MEDIA =
  COUPANG_CATALOG_MAX_MEDIA_PER_OWNER * (COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT + 1);
export const COUPANG_CATALOG_MAX_PRODUCT_BYTES = 512 * 1024;
export const COUPANG_CATALOG_MAX_RAW_BYTES = 64 * 1024;
export const COUPANG_CATALOG_MAX_DOCUMENT_BYTES = 64 * 1024;
export const COUPANG_CATALOG_MAX_DOCUMENTS_PER_PRODUCT = 2_000;

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

export const CoupangCatalogAttributeKindSchema = z.enum(['purchase', 'search']);
export type CoupangCatalogAttributeKind = z.infer<typeof CoupangCatalogAttributeKindSchema>;

/**
 * 한 속성. `type`·`value`는 옛 수집기가 보내는 모양이고, `kind`·`attributeTypeId`·`exposed`는
 * KID-349가 더한 선택 칸이다. 없으면 서버가 경로로 kind를 정하고 나머지는 `null`로 저장한다.
 */
export const CoupangCatalogAttributeV1Schema = z.object({
  type: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(2_000),
  kind: CoupangCatalogAttributeKindSchema.optional(),
  attributeTypeId: z.string().trim().min(1).max(200).nullable().optional(),
  exposed: z.boolean().nullable().optional(),
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

function stableDocumentValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableDocumentValue).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableDocumentValue(nested)}`)
    .join(',')}}`;
}

export const CoupangCatalogDeletionOutcomeSchema = z.enum(['deleted', 'present', 'not_found']);
export type CoupangCatalogDeletionOutcome = z.infer<typeof CoupangCatalogDeletionOutcomeSchema>;

/** 실행 품질 보고 (KID-348): 종료 트랜잭션이 채운다. 화면은 미확인 목록을 그대로 보여 준다. */
export const CoupangCatalogCollectionQualitySchema = z.object({
  detailTargets: z.number().int().nonnegative(),
  detailApplied: z.number().int().nonnegative(),
  detailUnchanged: z.number().int().nonnegative(),
  deletedProducts: z.number().int().nonnegative(),
  unconfirmedAbsentProductIds: z.array(ExternalIdSchema),
});
export type CoupangCatalogCollectionQuality = z.infer<typeof CoupangCatalogCollectionQualitySchema>;

// ── 실행 계약 kind (KID-354): Wing 카탈로그 동기화 셋 ───────────────────────────────
// 옛 attempt 경로와 그 청크 봉투·계획·상태 스키마는 지웠다. 청크 payload 원소는 위 상품 스키마이고, 순번은 실행
// 계약(chunkKind·sequence)이 맡는다.

export const WING_CATALOG_LIST_KIND = 'channels.wing_catalog_list' as const;
export const WING_CATALOG_DETAILS_KIND = 'channels.wing_catalog_details' as const;
export const WING_CATALOG_EXCEL_KIND = 'channels.wing_catalog_excel' as const;
export const WING_CATALOG_KINDS = [WING_CATALOG_LIST_KIND, WING_CATALOG_DETAILS_KIND, WING_CATALOG_EXCEL_KIND] as const;

/** 청크 종류(chunkKind). 목록 kind는 `listing_basics`만, 상세 kind는 `full_details`·`deletion_confirmation`. */
export const WING_CATALOG_CHUNK_KINDS = {
  listingBasics: 'listing_basics',
  fullDetails: 'full_details',
  deletionConfirmation: 'deletion_confirmation',
} as const;

const WingCatalogProductIdsSchema = z.array(ExternalIdSchema).max(100_000);

/** `channels.wing_catalog_list` scope: 어느 계정의 목록인가. lockKey는 `account:<channelAccountId>`. */
export const WingCatalogListScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
}).strict();
export type WingCatalogListScope = z.infer<typeof WingCatalogListScopeSchema>;

/** `channels.wing_catalog_list` result: 상세 계획. `next`가 있으면 확장이 상세 kind를 이어서 begin한다. */
export const WingCatalogListResultSchema = z.object({
  listedProductCount: z.number().int().nonnegative(),
  detailTargetProductIds: WingCatalogProductIdsSchema,
  absentProductIds: WingCatalogProductIdsSchema,
  next: z.object({
    kind: z.literal(WING_CATALOG_DETAILS_KIND),
    scope: z.lazy(() => WingCatalogDetailsScopeSchema),
  }).strict().nullable(),
}).strict();
export type WingCatalogListResult = z.infer<typeof WingCatalogListResultSchema>;

/**
 * `channels.wing_catalog_details` scope. 목록 kind의 result에서 오거나, "상품 하나 다시 받기"가
 * `{ detailTargetProductIds: [id], absentProductIds: [] }`로 직접 시작한다. owner `plan`이 두 목록을 저장 행과 대조한다.
 */
export const WingCatalogDetailsScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
  detailTargetProductIds: WingCatalogProductIdsSchema,
  absentProductIds: WingCatalogProductIdsSchema,
  /**
   * 어디서 시작했나: `list`는 목록 kind의 `result.next`(동기화 연쇄), `manual`은 운영자가 직접 시작한 상품 하나
   * 다시 받기. 카탈로그 신선도는 동기화 연쇄의 상세만 센다.
   */
  via: z.enum(['list', 'manual']).default('manual'),
}).strict();
export type WingCatalogDetailsScope = z.infer<typeof WingCatalogDetailsScopeSchema>;

/** `channels.wing_catalog_excel` scope. 파일 자체는 begin의 `fileHash`(unique)로 식별한다. */
export const WingCatalogExcelScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
  observedAt: z.string().datetime({ offset: true }).optional(),
}).strict();
export type WingCatalogExcelScope = z.infer<typeof WingCatalogExcelScopeSchema>;

/** 청크 payload 원소. 순번·연속성은 실행 계약의 (chunkKind, sequence)가 보장하므로 ordinal은 없다. */
export const WingCatalogListingBasicsItemSchema = CoupangCatalogBasicProductV1Schema;
export const WingCatalogFullDetailsItemSchema = CoupangCatalogDetailProductV1Schema;
export const WingCatalogDeletionConfirmationItemSchema = z.object({
  externalProductId: ExternalIdSchema,
  outcome: CoupangCatalogDeletionOutcomeSchema,
  productStatus: NullableTextSchema.optional().default(null),
}).strict();
export type WingCatalogDeletionConfirmationItem = z.infer<typeof WingCatalogDeletionConfirmationItemSchema>;

/** `channels.wing_catalog_excel` result(KID-351): 엑셀 반영 수. 업로드 응답 `{ operation }`의 `operation.result`. */
export const WingCatalogExcelResultSchema = z.object({
  createdProductCount: z.number().int().nonnegative(),
  updatedProductCount: z.number().int().nonnegative(),
  createdSkuCount: z.number().int().nonnegative(),
  updatedSkuCount: z.number().int().nonnegative(),
  skippedRowCount: z.number().int().nonnegative(),
}).strict();
export type WingCatalogExcelResult = z.infer<typeof WingCatalogExcelResultSchema>;
