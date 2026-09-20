import { z } from 'zod';
import { zIsoDate } from './common.js';

/**
 * 판매상품(사방넷 품번)과 단품(옵션) 계약 — ADR-0014.
 *
 * 몰에 보낼 상품을 한 번 편집하고 여러 몰로 보낸다. 판매상품은 등록용 정의일 뿐 재고 · ABC 정체성이
 * 아니고, 단품의 셀피아 구성은 선언이다(연결한 채널 옵션의 빈 레시피를 채울 때만 복사된다).
 */

export const SALES_PRODUCT_STATUSES = ['draft', 'active', 'paused', 'sold_out', 'unused', 'archived'] as const;
export const SalesProductStatusSchema = z.enum(SALES_PRODUCT_STATUSES);
export type SalesProductStatus = z.infer<typeof SalesProductStatusSchema>;

export const SALES_PRODUCT_OPTION_SUPPLY_STATUSES = ['selling', 'sold_out', 'unused'] as const;
export const SalesProductOptionSupplyStatusSchema = z.enum(SALES_PRODUCT_OPTION_SUPPLY_STATUSES);
export type SalesProductOptionSupplyStatus = z.infer<typeof SalesProductOptionSupplyStatusSchema>;

export const SALES_PRODUCT_TAX_TYPES = ['taxable', 'tax_free', 'zero_rated', 'unknown'] as const;
export const SalesProductTaxTypeSchema = z.enum(SALES_PRODUCT_TAX_TYPES);
export type SalesProductTaxType = z.infer<typeof SalesProductTaxTypeSchema>;

export const SALES_PRODUCT_DELIVERY_FEE_TYPES = ['free', 'collect', 'prepay', 'collect_or_prepay'] as const;
export const SalesProductDeliveryFeeTypeSchema = z.enum(SALES_PRODUCT_DELIVERY_FEE_TYPES);
export type SalesProductDeliveryFeeType = z.infer<typeof SalesProductDeliveryFeeTypeSchema>;

/** 옵션 단은 셋까지다. 화면과 사방넷 엑셀은 둘까지 쓴다. */
export const SALES_PRODUCT_MAX_OPTION_AXES = 3;
/** 한 상품의 단품 수 상한. 사방넷 실데이터 최대 50, 쿠팡 API 상한 200. */
export const SALES_PRODUCT_MAX_OPTIONS = 200;
/** 사방넷이 옵션명에 받지 않는 글자. `:` 는 옵션 단 구분자다. */
export const SALES_PRODUCT_OPTION_FORBIDDEN_CHARS = [':', '|', '^', '<', '>'] as const;

const MAX_KRW = 1_000_000_000;
const money = z.number().int().min(0).max(MAX_KRW);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const requiredText = (max: number) => z.string().trim().min(1).max(max);

function hasForbiddenOptionChar(value: string): boolean {
  return SALES_PRODUCT_OPTION_FORBIDDEN_CHARS.some((char) => value.includes(char));
}

const optionText = requiredText(100).refine(
  (value) => !hasForbiddenOptionChar(value),
  { message: `옵션에는 ${SALES_PRODUCT_OPTION_FORBIDDEN_CHARS.join(' ')} 를 쓸 수 없습니다.` },
);

/** 단품 값들을 한 줄 키로 — 옵션 없는 상품은 빈 문자열. */
export function salesProductOptionKey(values: readonly string[]): string {
  return values.map((value) => value.trim()).join(':');
}

/**
 * 옵션 단마다의 값 목록으로 조합을 만든다(데카르트 곱). 단이 없으면 옵션 없는 한 줄([[]]).
 * 빈 값과 같은 단 안의 중복은 버린다.
 */
export function buildSalesProductOptionCombinations(axesValues: readonly (readonly string[])[]): string[][] {
  const cleaned = axesValues.map((values) => [...new Set(values.map((value) => value.trim()).filter(Boolean))]);
  if (cleaned.length === 0) return [[]];
  if (cleaned.some((values) => values.length === 0)) return [];
  return cleaned.reduce<string[][]>(
    (rows, values) => rows.flatMap((row) => values.map((value) => [...row, value])),
    [[]],
  );
}

/** 새 단품코드 — `{판매상품코드}-0001` 모양으로, 이미 쓴 번호 다음. */
/**
 * 몰로 보낼 단품 가격 — 판매가 + 추가금액. 그 몰의 몰별 값이 있으면 그 값(금액이 %보다 먼저)에 추가금액을 더한다.
 * 서버 · 등록 초안 · 편집 화면이 모두 이 한 규칙을 쓴다.
 */
export function salesProductMallPrice(input: {
  salePrice: number;
  extraPrice: number;
  override?: { salePrice: number | null; priceRateBp: number | null } | null;
}): number {
  const base = input.override?.salePrice
    ?? (input.override?.priceRateBp
      ? Math.round((input.salePrice * input.override.priceRateBp) / 10_000)
      : input.salePrice);
  return Math.max(0, base + input.extraPrice);
}

export function nextSalesProductOptionCode(productCode: string, existingCodes: readonly string[]): string {
  const prefix = `${productCode}-`;
  const used = existingCodes
    .filter((code) => code.startsWith(prefix))
    .map((code) => Number(code.slice(prefix.length)))
    .filter((value) => Number.isInteger(value) && value > 0);
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export const SalesProductCertificationSchema = z.object({
  number: requiredText(100),
  issuer: optionalText(100),
  field: optionalText(100),
  validFrom: optionalText(10),
  validTo: optionalText(10),
  issuedAt: optionalText(10),
  certifiedAt: optionalText(10),
  imageUrl: optionalText(1000),
}).strict();
export type SalesProductCertification = z.infer<typeof SalesProductCertificationSchema>;

export const SalesProductOptionComponentInputSchema = z.object({
  sellpiaInventorySkuId: z.string().uuid(),
  quantity: z.number().int().min(1).max(999),
}).strict();
export type SalesProductOptionComponentInput = z.infer<typeof SalesProductOptionComponentInputSchema>;

export const SalesProductOptionInputSchema = z.object({
  /** 이미 있는 단품을 고칠 때 그 단품 id. 없으면 값(optionKey)으로 찾고, 그래도 없으면 새로 만든다. */
  id: z.string().uuid().optional(),
  optionCode: z.string().trim().min(1).max(80).optional(),
  values: z.array(optionText).max(SALES_PRODUCT_MAX_OPTION_AXES),
  alias: optionalText(100),
  barcode: optionalText(60),
  extraPrice: z.number().int().min(-MAX_KRW).max(MAX_KRW).default(0),
  supplyStatus: SalesProductOptionSupplyStatusSchema.default('selling'),
  safetyStock: z.number().int().min(0).max(1_000_000).nullable().optional(),
  components: z.array(SalesProductOptionComponentInputSchema).max(10).default([]),
}).strict();
export type SalesProductOptionInput = z.input<typeof SalesProductOptionInputSchema>;

const OptionSetSchema = z.object({
  optionAxes: z.array(optionText).max(SALES_PRODUCT_MAX_OPTION_AXES).default([]),
  options: z.array(SalesProductOptionInputSchema).min(1).max(SALES_PRODUCT_MAX_OPTIONS),
});

function refineOptionSet(value: z.infer<typeof OptionSetSchema>, ctx: z.RefinementCtx): void {
  const axes = value.optionAxes;
  if (new Set(axes).size !== axes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['optionAxes'], message: '옵션 단 이름이 겹칩니다.' });
  }
  if (axes.length === 0 && value.options.length !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: '옵션 단이 없으면 단품은 하나입니다.' });
  }
  const keys = new Set<string>();
  value.options.forEach((option, index) => {
    if (option.values.length !== axes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options', index, 'values'],
        message: `옵션 값은 단 수(${axes.length})만큼 있어야 합니다.`,
      });
      return;
    }
    const key = salesProductOptionKey(option.values);
    if (keys.has(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options', index, 'values'], message: '같은 옵션이 두 번 있습니다.' });
    }
    keys.add(key);
    const skuIds = option.components.map((component) => component.sellpiaInventorySkuId);
    if (new Set(skuIds).size !== skuIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options', index, 'components'], message: '같은 셀피아 상품이 두 번 있습니다.' });
    }
  });
  const codes = value.options.map((option) => option.optionCode).filter(Boolean);
  if (new Set(codes).size !== codes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: '단품코드가 겹칩니다.' });
  }
}

export const SalesProductBasicsInputSchema = z.object({
  name: requiredText(255),
  ownCode: optionalText(100),
  shortName: optionalText(255),
  englishName: optionalText(255),
  printName: optionalText(255),
  modelName: optionalText(60),
  modelNo: optionalText(60),
  brand: optionalText(50),
  manufacturer: optionalText(50),
  originCountry: optionalText(50),
  originRegion: optionalText(50),
  keywords: z.array(requiredText(60)).max(30).default([]),
  standardCategory: optionalText(40),
  status: SalesProductStatusSchema.default('active'),
  taxType: SalesProductTaxTypeSchema.default('taxable'),
  deliveryFeeType: SalesProductDeliveryFeeTypeSchema.nullable().optional(),
  deliveryFee: money.nullable().optional(),
  costPrice: money.nullable().optional(),
  salePrice: money,
  tagPrice: money.nullable().optional(),
  stockManaged: z.boolean().default(false),
  imageUrls: z.array(requiredText(1000)).max(30).default([]),
  detailHtml: z.string().max(200_000).nullable().optional(),
  extraDetailHtml: z.array(z.string().max(200_000)).max(3).default([]),
  noticeCategory: optionalText(10),
  noticeValues: z.array(z.string().max(1000)).max(40).default([]),
  certifications: z.array(SalesProductCertificationSchema).max(10).default([]),
  importDeclarationNo: optionalText(60),
  adminMemo: optionalText(2000),
}).strict();
export type SalesProductBasicsInput = z.input<typeof SalesProductBasicsInputSchema>;

export const SalesProductCreateInputSchema = SalesProductBasicsInputSchema.extend({
  /** 판매상품코드. 비우면 서버가 만든다. */
  code: z.string().trim().min(1).max(60).optional(),
  optionAxes: OptionSetSchema.shape.optionAxes,
  options: OptionSetSchema.shape.options,
}).strict().superRefine(refineOptionSet);
export type SalesProductCreateInput = z.input<typeof SalesProductCreateInputSchema>;

export const SalesProductUpdateInputSchema = SalesProductBasicsInputSchema.partial().extend({
  expectedVersion: z.number().int().min(1),
}).strict();
export type SalesProductUpdateInput = z.input<typeof SalesProductUpdateInputSchema>;

/**
 * 수집상품으로 되돌리기 — 수집상품에서 만든 판매상품을 `archived` 로 내린다(코드 · 몰별 값은 남긴다). 같은 수집상품을
 * 다시 판매상품으로 올리면 이 판매상품이 되살아난다.
 */
export const SalesProductDemoteRequestSchema = z.object({
  expectedVersion: z.number().int().min(1),
}).strict();
export type SalesProductDemoteRequest = z.input<typeof SalesProductDemoteRequestSchema>;

/** 옵션 전체 교체. 연결된 단품은 지우지 않고 `unused` 로 남긴다. */
export const SalesProductOptionsReplaceInputSchema = OptionSetSchema.extend({
  expectedVersion: z.number().int().min(1),
}).strict().superRefine(refineOptionSet);
export type SalesProductOptionsReplaceInput = z.input<typeof SalesProductOptionsReplaceInputSchema>;

export const SalesProductChannelOverrideInputSchema = z.object({
  salePrice: money.nullable().optional(),
  priceRateBp: z.number().int().min(1).max(100_000).nullable().optional(),
  costPrice: money.nullable().optional(),
  name: optionalText(255),
  detailHtml: z.string().max(200_000).nullable().optional(),
  promoText: optionalText(255),
  noticeCategory: optionalText(10),
  stockPercent: z.number().int().min(0).max(100).nullable().optional(),
  adapterValues: z.record(z.string(), z.string().max(2000)).nullable().optional(),
}).strict();
export type SalesProductChannelOverrideInput = z.input<typeof SalesProductChannelOverrideInputSchema>;

export const SalesProductOptionComponentSchema = z.object({
  sellpiaInventorySkuId: z.string().uuid(),
  sellpiaCode: z.string(),
  name: z.string(),
  optionName: z.string().nullable(),
  quantity: z.number().int(),
  currentStock: z.number().int().nullable(),
});
export type SalesProductOptionComponent = z.infer<typeof SalesProductOptionComponentSchema>;

export const SalesProductOptionSchema = z.object({
  id: z.string().uuid(),
  optionCode: z.string(),
  values: z.array(z.string()),
  optionKey: z.string(),
  alias: z.string().nullable(),
  barcode: z.string().nullable(),
  extraPrice: z.number().int(),
  supplyStatus: SalesProductOptionSupplyStatusSchema,
  safetyStock: z.number().int().nullable(),
  sortOrder: z.number().int(),
  components: z.array(SalesProductOptionComponentSchema),
  /** 이 단품에 연결된 몰 옵션 수. 연결된 단품은 지우지 않는다. */
  linkedChannelOptionCount: z.number().int().min(0),
});
export type SalesProductOption = z.infer<typeof SalesProductOptionSchema>;

export const SalesProductChannelOverrideSchema = z.object({
  id: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  mallKey: z.string(),
  mallName: z.string(),
  salePrice: z.number().int().nullable(),
  priceRateBp: z.number().int().nullable(),
  costPrice: z.number().int().nullable(),
  name: z.string().nullable(),
  detailHtml: z.string().nullable(),
  promoText: z.string().nullable(),
  noticeCategory: z.string().nullable(),
  stockPercent: z.number().int().nullable(),
  adapterValues: z.record(z.string(), z.string()).nullable(),
  version: z.number().int(),
  updatedAt: zIsoDate,
});
export type SalesProductChannelOverride = z.infer<typeof SalesProductChannelOverrideSchema>;

export const SalesProductChannelListingSchema = z.object({
  id: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  mallKey: z.string(),
  mallName: z.string(),
  externalId: z.string(),
  displayName: z.string().nullable(),
  status: z.string().nullable(),
  isActive: z.boolean(),
  /** 몰 옵션 — 가져올 때 읽은 몰 판매가와 이어진 단품. */
  options: z.array(z.object({
    id: z.string().uuid(),
    externalOptionId: z.string(),
    itemName: z.string().nullable(),
    salePrice: z.number().int().nullable(),
    salesProductOptionId: z.string().uuid().nullable(),
  })),
});
export type SalesProductChannelListing = z.infer<typeof SalesProductChannelListingSchema>;

export const SalesProductSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  ownCode: z.string().nullable(),
  sabangnetGoodsNo: z.string().nullable(),
  /** 수집상품에서 만든 판매상품이면 그 수집상품 id. 이 판매상품만 수집상품으로 되돌릴 수 있다. */
  sourceCandidateId: z.string().uuid().nullable(),
  name: z.string(),
  shortName: z.string().nullable(),
  englishName: z.string().nullable(),
  printName: z.string().nullable(),
  modelName: z.string().nullable(),
  modelNo: z.string().nullable(),
  brand: z.string().nullable(),
  manufacturer: z.string().nullable(),
  originCountry: z.string().nullable(),
  originRegion: z.string().nullable(),
  keywords: z.array(z.string()),
  standardCategory: z.string().nullable(),
  status: SalesProductStatusSchema,
  taxType: SalesProductTaxTypeSchema,
  deliveryFeeType: SalesProductDeliveryFeeTypeSchema.nullable(),
  deliveryFee: z.number().int().nullable(),
  costPrice: z.number().int().nullable(),
  salePrice: z.number().int(),
  tagPrice: z.number().int().nullable(),
  optionAxes: z.array(z.string()),
  stockManaged: z.boolean(),
  optionsLocked: z.boolean(),
  imageUrls: z.array(z.string()),
  detailHtml: z.string().nullable(),
  extraDetailHtml: z.array(z.string()),
  noticeCategory: z.string().nullable(),
  noticeValues: z.array(z.string()),
  certifications: z.array(SalesProductCertificationSchema),
  importDeclarationNo: z.string().nullable(),
  adminMemo: z.string().nullable(),
  version: z.number().int(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
  options: z.array(SalesProductOptionSchema),
  channelOverrides: z.array(SalesProductChannelOverrideSchema),
  channelListings: z.array(SalesProductChannelListingSchema),
});
export type SalesProduct = z.infer<typeof SalesProductSchema>;

export const SalesProductListQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  status: SalesProductStatusSchema.optional(),
  /** `with_options`: 단품이 둘 이상 · `unlinked`: 셀피아 연결이 빠진 단품이 있는 상품. */
  focus: z.enum(['all', 'with_options', 'unlinked']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type SalesProductListQuery = z.infer<typeof SalesProductListQuerySchema>;

export const SalesProductListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  ownCode: z.string().nullable(),
  name: z.string(),
  status: SalesProductStatusSchema,
  salePrice: z.number().int(),
  imageUrl: z.string().nullable(),
  optionAxes: z.array(z.string()),
  optionCount: z.number().int(),
  sellingOptionCount: z.number().int(),
  /** 셀피아 구성이 비어 있는 단품 수(미사용 제외). */
  unlinkedOptionCount: z.number().int(),
  channelListingCount: z.number().int(),
  channelOverrideCount: z.number().int(),
  updatedAt: zIsoDate,
});
export type SalesProductListItem = z.infer<typeof SalesProductListItemSchema>;

export const SalesProductListResponseSchema = z.object({
  items: z.array(SalesProductListItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  summary: z.object({
    total: z.number().int(),
    withOptions: z.number().int(),
    withUnlinkedOptions: z.number().int(),
  }),
});
export type SalesProductListResponse = z.infer<typeof SalesProductListResponseSchema>;

// ── 몰 상품 ↔ 판매상품 잇기(ADR-0014) ─────────────────────────────────

/**
 * 잇는 근거 — 모두 코드가 정확히 같은 경우만이다(이름으로 잇지 않는다).
 * - `sabangnet_record`: 사방넷 송신 기록에서 가져온 몰 상품의 사방넷 품번
 * - `send_record_file`: 사방넷 쇼핑몰상품수정 다운로드의 (쇼핑몰, 쇼핑몰상품코드) → 품번
 * - `seller_code`: 몰에 적힌 판매자 상품코드 = 판매상품 자체상품코드
 */
export const SALES_PRODUCT_LINK_SOURCES = ['sabangnet_record', 'send_record_file', 'seller_code'] as const;
export const SalesProductLinkSourceSchema = z.enum(SALES_PRODUCT_LINK_SOURCES);
export type SalesProductLinkSource = z.infer<typeof SalesProductLinkSourceSchema>;

export const SalesProductLinkResultSchema = z.object({
  /** 이번에 판매상품을 새로 이은 몰 상품 수. */
  linkedListings: z.number().int(),
  /** 이미 이어져 있던 몰 상품 수(그대로 둔다). */
  alreadyLinked: z.number().int(),
  /** 몰 옵션 ↔ 단품을 이은 수(옵션 하나인 상품끼리만). */
  linkedOptions: z.number().int(),
  /** 비어 있던 몰 옵션 레시피를 단품의 셀피아 구성으로 채운 수. */
  recipesFilled: z.number().int(),
  /** 근거가 서로 다른 판매상품을 가리켜 잇지 않은 몰 상품 수. */
  conflicts: z.number().int(),
  bySource: z.record(SalesProductLinkSourceSchema, z.number().int()),
});
export type SalesProductLinkResult = z.infer<typeof SalesProductLinkResultSchema>;

// ── 사방넷 엑셀 가져오기 ──────────────────────────────────────────────

/** 사방넷에서 내려받는 파일 종류. 머리 이름으로 알아본다. */
export const SABANGNET_WORKBOOK_KINDS = [
  'products',
  'options',
  'channel_overrides',
  'send_records',
  'mall_categories',
  'mall_templates',
] as const;
export const SabangnetWorkbookKindSchema = z.enum(SABANGNET_WORKBOOK_KINDS);
export type SabangnetWorkbookKind = z.infer<typeof SabangnetWorkbookKindSchema>;

export const SabangnetImportIssueSchema = z.object({
  kind: SabangnetWorkbookKindSchema,
  row: z.number().int(),
  code: z.string().nullable(),
  message: z.string(),
});
export type SabangnetImportIssue = z.infer<typeof SabangnetImportIssueSchema>;

export const SabangnetImportPreviewSchema = z.object({
  dryRun: z.boolean(),
  files: z.array(z.object({ name: z.string(), kind: SabangnetWorkbookKindSchema, rows: z.number().int() })),
  products: z.object({
    total: z.number().int(),
    created: z.number().int(),
    updated: z.number().int(),
    unchanged: z.number().int(),
  }),
  options: z.object({
    total: z.number().int(),
    withOptionsProducts: z.number().int(),
    /** 셀피아 상품코드 · 옵션명이 정확히 맞아 연결한 단품 수. */
    linked: z.number().int(),
    unlinked: z.number().int(),
  }),
  channelOverrides: z.object({
    total: z.number().int(),
    saved: z.number().int(),
    /** 우리 몰 계정이 없어 넘긴 사방넷 쇼핑몰 코드와 줄 수. */
    skippedByShop: z.record(z.string(), z.number().int()),
  }),
  issues: z.array(SabangnetImportIssueSchema).max(200),
  issueCount: z.number().int(),
  /** 몰에 올라간 상품 ↔ 판매상품 잇기 결과. 옮길 때는 늘 잇고, 송신 기록 없이 미리볼 때만 null. */
  links: SalesProductLinkResultSchema.nullable(),
  /** 송신 기록에서 읽은 상품 × 몰의 사방넷 분류 · 부가정보. 송신 기록이 없으면 null. */
  mallValues: z.object({
    pairs: z.number().int(),
    withCategory: z.number().int(),
    withTemplate: z.number().int(),
  }).nullable(),
});
export type SabangnetImportPreview = z.infer<typeof SabangnetImportPreviewSchema>;

// ── 사진 옮기기(사방넷 서버 → 우리 저장소) ─────────────────────────────

export const SalesProductExternalImagesSchema = z.object({
  /** 사방넷 서버에 남아 있어 옮겨야 하는 사진 수. */
  images: z.number().int(),
  /** 그런 사진이 있는 판매상품 수. */
  products: z.number().int(),
});
export type SalesProductExternalImages = z.infer<typeof SalesProductExternalImagesSchema>;

export const SalesProductImageMirrorResultSchema = z.object({
  mirrored: z.number().int(),
  failedCount: z.number().int(),
  failed: z.array(z.object({ url: z.string(), reason: z.string() })).max(20),
  productsUpdated: z.number().int(),
  /** 그사이 누가 고쳐 이번에 쓰지 못한 판매상품. 다음 묶음에서 다시 옮긴다. */
  productsSkipped: z.number().int(),
  /** 아직 옮기지 못한 사진 수. */
  remaining: z.number().int(),
  /** 다음 묶음을 부를 때 넘길 `skip` — 이번까지 못 옮긴 사진은 건너뛴다. */
  nextSkip: z.number().int(),
});
export type SalesProductImageMirrorResult = z.infer<typeof SalesProductImageMirrorResultSchema>;

// ── 몰별 사방넷 분류 · 부가정보(상품 × 몰 몰별 값의 adapterValues) ─────────────

/**
 * 사방넷 송신 기록에서 옮긴 상품 × 몰 값의 키. 몰 등록 칸 값(`categoryPath` 등)과 섞이지 않게 `sabangnet` 으로
 * 시작한다 — 등록 화면은 이 값을 고를거리로만 보이고, 어댑터 칸을 대신 채우지 않는다.
 */
export const SALES_PRODUCT_SABANGNET_VALUE_KEYS = {
  categoryCode: 'sabangnetCategoryCode',
  categoryTitle: 'sabangnetCategoryTitle',
  categoryPath: 'sabangnetCategoryPath',
  templateCode: 'sabangnetTemplateCode',
  templateTitle: 'sabangnetTemplateTitle',
  namePrefix: 'sabangnetNamePrefix',
  nameSuffix: 'sabangnetNameSuffix',
  detailTop: 'sabangnetDetailTop',
  detailBottom: 'sabangnetDetailBottom',
} as const;

export const SalesProductMallCategoriesSchema = z.object({
  mallKey: z.string(),
  categories: z.array(z.object({
    /** 몰 분류 경로(사방넷이 몰에 보낸 그대로, `>` 로 잇는다). */
    path: z.string(),
    /** 사방넷에서 붙인 분류 이름. */
    title: z.string().nullable(),
    /** 이 분류를 쓴 판매상품 수. */
    count: z.number().int(),
  })),
});
export type SalesProductMallCategories = z.infer<typeof SalesProductMallCategoriesSchema>;

// ── 몰 가격을 몰별 값으로 가져오기 ─────────────────────────────────────

/**
 * 몰 가격을 몰별 값으로 가져오지 못한 까닭.
 * - `options_disagree`: 같은 몰에서 옵션 · 몰 상품마다 맞출 판매가가 다르다(몰별 값은 몰 하나에 판매가 하나).
 * - `below_extra_price`: 몰 가격이 단품 추가금액보다 작아 몰별 판매가가 0 이하가 된다.
 */
export const SALES_PRODUCT_MALL_PRICE_CONFLICT_REASONS = ['options_disagree', 'below_extra_price'] as const;
export const SalesProductMallPriceConflictReasonSchema = z.enum(SALES_PRODUCT_MALL_PRICE_CONFLICT_REASONS);

export const SalesProductMallPriceAdoptionSchema = z.object({
  /** false 면 미리보기 — 쓰지 않았다. */
  applied: z.boolean(),
  /** 몰별 판매가를 몰 가격으로 바꿀(바꾼) 상품 × 몰. */
  pairs: z.number().int(),
  products: z.number().int(),
  /** 이미 같은 상품 × 몰. */
  unchanged: z.number().int(),
  conflicts: z.number().int(),
  conflictSamples: z.array(z.object({
    code: z.string(),
    name: z.string(),
    mallName: z.string(),
    reason: SalesProductMallPriceConflictReasonSchema,
    prices: z.array(z.number().int()),
  })).max(20),
  /** 몰 이름 → 바꿀(바꾼) 상품 수. */
  byMall: z.record(z.string(), z.number().int()),
});
export type SalesProductMallPriceAdoption = z.infer<typeof SalesProductMallPriceAdoptionSchema>;


// ── 몰 대량등록 엑셀(판매상품 → 몰 양식) ─────────────────────────────────────

/** 몰 대량등록 엑셀 하나 — 화면이 몰을 고르고 고정값 칸을 그린다. */
export const SalesProductMallSheetSchema = z.object({
  sheetKey: z.string(),
  label: z.string(),
  /** 이 파일이 올라가는 몰 키(ESM 은 G마켓 · 옥션 둘). */
  mallKeys: z.array(z.string()),
  /** 몰 분류를 번호로 받는가(`code`, 몰 카테고리표로 경로를 번호로 바꾼다), 이름 그대로 받는가(`name`). */
  categoryBy: z.enum(['code', 'name']),
  /** 몰이 한 파일에 받는 상품 수. */
  maxProducts: z.number().int(),
  /** 몰 계정에 한 번 정하는 값(출하지 코드 · 스토어명 …)과 기본값. */
  fixedFields: z.array(z.object({
    key: z.string(),
    label: z.string(),
    required: z.boolean(),
    defaultValue: z.string(),
    help: z.string().nullable(),
  })),
  /** 올리는 곳 · 올린 뒤 할 일. */
  notes: z.array(z.string()),
});
export type SalesProductMallSheet = z.infer<typeof SalesProductMallSheetSchema>;

export const SalesProductMallSheetListSchema = z.object({
  sheets: z.array(SalesProductMallSheetSchema),
  /** 신규 등록 엑셀이 없는 몰과 그 까닭 — 폼 채우기 등록으로 간다. */
  unavailable: z.array(z.object({ mallKey: z.string(), reason: z.string() })),
});
export type SalesProductMallSheetList = z.infer<typeof SalesProductMallSheetListSchema>;

export const SALES_PRODUCT_MALL_SHEET_MAX_IDS = 1000;

export const SalesProductMallSheetRequestSchema = z.object({
  /** 비우면(확인만) 이 몰에 아직 없는 판매상품 — 몰 상품과 이어지지 않았고 사방넷이 보낸 적도 없는 것. */
  salesProductIds: z.array(z.string().uuid()).max(SALES_PRODUCT_MALL_SHEET_MAX_IDS).optional(),
  /** 고정값. 빈 칸은 기본값을 쓴다. */
  fixed: z.record(z.string(), z.string().max(1000)).default({}),
}).strict();
export type SalesProductMallSheetRequest = z.infer<typeof SalesProductMallSheetRequestSchema>;

/**
 * 상품 × 몰 분류 — 몰 엑셀은 이 몰 분류가 있어야(번호로 받는 몰은 번호로 바뀌어야) 넣는다.
 * `source`: `set` 사람이 정한 값 · `sabangnet` 사방넷에서 옮긴 경로 · `none` 없음.
 */
export const SalesProductMallSheetCategorySchema = z.object({
  mallKey: z.string(),
  path: z.string().nullable(),
  code: z.string().nullable(),
  source: z.enum(['set', 'sabangnet', 'none']),
  /** 엑셀에 넣을 수 있는가(번호로 받는 몰은 번호가, 이름으로 받는 몰은 경로가 있어야). */
  resolved: z.boolean(),
  /** 풀리지 않았을 때, 같은 상품이 다른 몰에서 쓰는 분류로 짐작한 이 몰 분류. 사람이 확인해 저장해야 쓴다. */
  suggestion: z.object({
    path: z.string(),
    /** 투표한 몰들(또는 비슷한 이름의 판매상품들)이 이 분류에 준 몫의 평균(0~1). */
    share: z.number(),
    voters: z.number().int(),
    /** 짐작 근거: 같은 상품의 다른 몰 분류 · 이름이 비슷한 판매상품의 이 몰 분류. */
    basis: z.enum(['other_malls', 'similar_names']),
    /** 이 분류가 번호로 풀리는가(번호로 받는 몰). */
    resolves: z.boolean(),
  }).nullable(),
});
export type SalesProductMallSheetCategory = z.infer<typeof SalesProductMallSheetCategorySchema>;

export const SalesProductMallSheetCheckSchema = z.object({
  sheetKey: z.string(),
  /** `missing`: 이 몰에 없는 판매상품을 서버가 골랐다. `selected`: 보낸 id 그대로. */
  scope: z.enum(['selected', 'missing']),
  /** 비어 있는 필수 고정값 이름. 있으면 파일을 만들지 않는다. */
  missingFixed: z.array(z.string()),
  /**
   * `missing` 에서 뺀 판매상품 수 — 몰 상품과 이어지지 않았지만 사방넷이 이 몰에 보낸 적이 있어 이미 올라가 있을 수
   * 있는 것. 다시 올리면 몰에 같은 상품이 둘 생긴다.
   */
  maybeListed: z.number().int(),
  products: z.array(z.object({
    salesProductId: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    /** 파일에 들어갈 행 수(쿠팡은 단품마다 한 줄). 못 넣는 상품은 0. */
    rows: z.number().int(),
    problems: z.array(z.string()),
    warnings: z.array(z.string()),
    /** 이 파일에 들어갈 사진 중 몰이 못 읽어(우리 저장소) 막는 사진 수. [사진 올리기]가 공개 주소를 만든다. */
    unreadableImages: z.number().int(),
    /** 이 파일이 다루는 몰마다의 분류. */
    categories: z.array(SalesProductMallSheetCategorySchema),
  })),
  ready: z.number().int(),
  blocked: z.number().int(),
});
export type SalesProductMallSheetCheck = z.infer<typeof SalesProductMallSheetCheckSchema>;

/** 몰이 가진 분류 목록에서 찾은 경로(몰 엑셀 창의 분류 칸 고를거리). */
export const SalesProductMallSheetCategoryListSchema = z.object({
  sheetKey: z.string(),
  mallKey: z.string(),
  /** 찾은 분류 경로(`>` 로 이은 이름). 몰 분류표가 없는 몰이면 빈 배열. */
  paths: z.array(z.string()),
  /** 몰 분류표에 있는 전체 분류 수(0 이면 표가 없다). */
  total: z.number().int(),
});
export type SalesProductMallSheetCategoryList = z.infer<typeof SalesProductMallSheetCategoryListSchema>;

/** 여러 판매상품의 한 몰 분류를 한 번에 정한다(몰별 값의 `categoryPath`). */
export const SalesProductMallCategoryAssignRequestSchema = z.object({
  mallKey: z.string().trim().min(1).max(40),
  path: z.string().trim().min(1).max(300),
  salesProductIds: z.array(z.string().uuid()).min(1).max(SALES_PRODUCT_MALL_SHEET_MAX_IDS),
}).strict();
export type SalesProductMallCategoryAssignRequest = z.infer<typeof SalesProductMallCategoryAssignRequestSchema>;

export const SalesProductMallCategoryAssignResultSchema = z.object({
  /** 바뀐 상품 × 몰 줄 수(이미 같은 분류면 세지 않는다). */
  written: z.number().int(),
  /** 몰 카테고리표에서 이 경로의 번호(번호로 받는 몰). 없으면 null — 엑셀은 여전히 막힌다. */
  code: z.string().nullable(),
});
export type SalesProductMallCategoryAssignResult = z.infer<typeof SalesProductMallCategoryAssignResultSchema>;

// ── 수집상품 → 판매상품(수집상품 화면에서 몰 대량등록) ─────────────────────────

export const SALES_PRODUCT_FROM_CANDIDATES_MAX = 200;

/**
 * 수집상품 여러 개를 판매상품으로 만든다. 화면이 수집상품의 몰 공통 등록 초안으로 판매상품 내용을 만들어 보낸다. 같은
 * 수집상품에서 이미 만든 판매상품이 있으면 새로 만들지 않고 그것을 쓴다(사람이 고친 값은 덮지 않고, 비어 있는 사진 ·
 * 상세설명만 채운다).
 */
export const SalesProductFromCandidatesRequestSchema = z.object({
  items: z.array(z.object({
    candidateId: z.string().uuid(),
    product: SalesProductCreateInputSchema,
  }).strict()).min(1).max(SALES_PRODUCT_FROM_CANDIDATES_MAX),
}).strict();
export type SalesProductFromCandidatesRequest = z.input<typeof SalesProductFromCandidatesRequestSchema>;

export const SalesProductFromCandidatesResultSchema = z.object({
  products: z.array(z.object({
    candidateId: z.string().uuid(),
    salesProductId: z.string().uuid(),
    code: z.string(),
    /** 이번에 새로 만들었는가(false 면 이미 있던 판매상품). */
    created: z.boolean(),
  })),
  created: z.number().int(),
  reused: z.number().int(),
});
export type SalesProductFromCandidatesResult = z.infer<typeof SalesProductFromCandidatesResultSchema>;

// ── 몰이 읽을 공개 사진 복사본 ───────────────────────────────────────────────

/** 이 판매상품들의 사진 · 상세설명 사진 중 몰이 못 읽고(우리 저장소) 공개 복사본도 없는 주소. */
export const SalesProductPublicImagePendingSchema = z.object({
  urls: z.array(z.string()),
  /** 그런 사진이 있는 판매상품 수. */
  products: z.number().int(),
});
export type SalesProductPublicImagePending = z.infer<typeof SalesProductPublicImagePendingSchema>;

export const SalesProductPublicImagePendingRequestSchema = z.object({
  salesProductIds: z.array(z.string().uuid()).min(1).max(SALES_PRODUCT_MALL_SHEET_MAX_IDS),
}).strict();

/** 확장이 공개 저장소에 올린 결과를 저장한다. 판매상품의 사진 주소는 그대로 두고 복사본만 남긴다. */
export const SalesProductPublicImageSaveRequestSchema = z.object({
  images: z.array(z.object({
    sourceUrl: z.string().trim().min(1).max(2000),
    publicUrl: z.string().trim().url().max(2000),
    host: z.string().trim().min(1).max(40),
  }).strict()).min(1).max(500),
}).strict();
export type SalesProductPublicImageSaveRequest = z.input<typeof SalesProductPublicImageSaveRequestSchema>;
