import { z } from 'zod';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { stableStringify } from './catalog-collection-hash';

/**
 * `channel_listings.raw_json`·`channel_listing_options.raw_json`의 경로별 구역 (KID-349).
 *
 * 목록(list)·상세(detail)·[쿠팡상품정보] 엑셀(catalogExcel)은 각자 자기 구역만 통째로
 * 바꾸고 다른 구역은 건드리지 않는다. 저장은 `raw_json = COALESCE(raw_json,'{}') || <patch>`
 * 의 얕은 병합이므로 구역 하나가 최상위 키 하나다.
 *
 * 최상위 평면 키 가운데 다른 owner·화면이 읽는 것(`SHARED_LISTING_RAW_KEYS`)은 구역 밖에
 * 그대로 둔다. 그 밖의 평면 키(`modifiedOn`·`detailDocuments`·`detailDocumentIds`)는 구역이
 * 생기기 전 행에만 있고, 읽기 함수가 구역 모양으로 돌려준다. 옛 행을 옮기는 데이터
 * 마이그레이션은 없다.
 */
export const LISTING_RAW_SECTIONS = ['list', 'detail', 'catalogExcel'] as const;
export type ListingRawSection = (typeof LISTING_RAW_SECTIONS)[number];

/**
 * 구역 밖에 남는 평면 키. readiness·products·analytics·advertising·매칭이 읽는다
 * (`source`·`saleStatus`·`createdOn` 등). 여기 없는 키는 구역 안에만 쓴다.
 * `saleStartedAt`은 Products 판매 기간 계산(`common/product-sale-age.ts`)이 평면으로 읽는다 —
 * Wing 상세가 준다.
 */
export const SHARED_LISTING_RAW_KEYS = [
  'source',
  'externalProductId',
  'createdOn',
  'saleStatus',
  'productStatus',
  'saleStartedAt',
] as const;
export type SharedListingRawKey = (typeof SHARED_LISTING_RAW_KEYS)[number];

/** `null`은 구역이 생기기 전 행에서 평면 키로 읽었다는 뜻이다. */
const ObservedAtSchema = z.string().datetime({ offset: true }).nullable();
const JsonRecordSchema = z.record(z.unknown());

export const ListingListSectionSchema = z.object({
  observedAt: ObservedAtSchema,
  modifiedOn: z.string().nullable(),
  createdOn: z.string().nullable(),
  productStatus: z.string().nullable(),
  /** Wing 목록 API가 준 상품 한 줄(옵션 제외). */
  raw: JsonRecordSchema,
}).strict();
export type ListingListSection = z.infer<typeof ListingListSectionSchema>;

export const ListingDetailDocumentSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  value: z.unknown(),
});
export type ListingDetailDocument = z.infer<typeof ListingDetailDocumentSchema>;

export const ListingDetailSectionSchema = z.object({
  observedAt: ObservedAtSchema,
  documents: z.array(ListingDetailDocumentSchema),
  /** Wing 상세 API가 준 상품 문서(문서 목록 제외). */
  raw: JsonRecordSchema,
  /**
   * 이 상세를 반영했을 때의 목록 `modifiedOn`(KID-354 `detailModifiedOn`). 상세 kind의 finalize만 쓰고, 목록이
   * 새 `modifiedOn`을 저장해도 그대로다 — 다음 동기화의 상세 대상은 이 값과 목록 값을 비교해 정한다.
   * 이 칸이 생기기 전 행에는 없다(한 번 다시 받는다).
   */
  modifiedOn: z.string().nullable().optional(),
}).strict();
export type ListingDetailSection = z.infer<typeof ListingDetailSectionSchema>;

/** 옵션 행의 [쿠팡상품정보] 엑셀 구역: 그 옵션 줄 그대로. */
export const OptionCatalogExcelSectionSchema = z.object({
  /** 내보내기를 요청한 시각. 엑셀 값은 이 시각 기준 스냅샷이다. */
  observedAt: ObservedAtSchema,
  /** 한글 헤더 → 셀 값. 빈 셀은 `null`. */
  row: z.record(z.string().nullable()),
}).strict();
export type OptionCatalogExcelSection = z.infer<typeof OptionCatalogExcelSectionSchema>;

/**
 * 리스팅 행의 [쿠팡상품정보] 엑셀 구역: 상품의 첫 줄과 파서가 정규화한 상품 칸(KID-349).
 * `exposedProductId`는 옵션 줄마다 다를 수 있어 첫 비지 않은 값이다 — 옵션별 값은 옵션 구역 `row`에 있다.
 */
export const CatalogExcelSectionSchema = OptionCatalogExcelSectionSchema.extend({
  searchTags: z.array(z.string().min(1)),
  exposedProductId: z.string().min(1).nullable(),
  adult: z.boolean().nullable(),
}).strict();
export type CatalogExcelSection = z.infer<typeof CatalogExcelSectionSchema>;

export const OptionListSectionSchema = z.object({
  observedAt: ObservedAtSchema,
  raw: JsonRecordSchema,
}).strict();
export type OptionListSection = z.infer<typeof OptionListSectionSchema>;

export const OptionDetailSectionSchema = z.object({
  observedAt: ObservedAtSchema,
  documentIds: z.array(z.string().min(1)),
  raw: JsonRecordSchema,
}).strict();
export type OptionDetailSection = z.infer<typeof OptionDetailSectionSchema>;

export type ListingRawSections = {
  list: ListingListSection | null;
  detail: ListingDetailSection | null;
  catalogExcel: CatalogExcelSection | null;
};

export type OptionRawSections = {
  list: OptionListSection | null;
  detail: OptionDetailSection | null;
  catalogExcel: OptionCatalogExcelSection | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** 읽은 행이 어느 상품인지. 손상된 구역 오류에 싣는다. */
export type RawSectionReadContext = { externalProductId?: string };

/**
 * 저장된 구역을 검증해 읽는다. 구역이 손상됐으면 추측하지 않고 등록 코드로 멈춘다 — 영어 Zod 오류가
 * 화면·확장에 새지 않게 한다.
 */
function section<T>(
  schema: z.ZodType<T>,
  value: unknown,
  name: ListingRawSection,
  context: RawSectionReadContext,
): T | null {
  if (value === undefined || value === null) return null;
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new KiditemInvalidValueError('SOURCE_SNAPSHOT_INVALID', {
    details: {
      reason: 'CATALOG_RAW_SECTION_INVALID',
      section: name,
      ...(context.externalProductId ? { externalProductId: context.externalProductId } : {}),
    },
  });
}

/** 구역 이전 평면 문서 목록. 모양이 맞지 않는 항목은 옛 읽기처럼 건너뛴다. */
function legacyDocuments(value: unknown[]): ListingDetailDocument[] {
  return value.flatMap((item) => {
    const parsed = ListingDetailDocumentSchema.safeParse(item);
    return parsed.success && Object.prototype.hasOwnProperty.call(item, 'value') ? [parsed.data] : [];
  });
}

function legacyDocumentIds(value: unknown[]): string[] {
  return value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

/** 구역이 있으면 구역을, 없으면 구역 이전 평면 키를 같은 모양으로 돌려준다. */
export function readListingRawSections(raw: unknown, context: RawSectionReadContext = {}): ListingRawSections {
  const flat = record(raw) ?? {};
  const list = section(ListingListSectionSchema, flat.list, 'list', context)
    ?? (text(flat.modifiedOn) !== null || text(flat.createdOn) !== null
      ? {
        observedAt: null,
        modifiedOn: text(flat.modifiedOn),
        createdOn: text(flat.createdOn),
        productStatus: text(flat.productStatus),
        raw: {},
      }
      : null);
  const detail = section(ListingDetailSectionSchema, flat.detail, 'detail', context)
    ?? (Array.isArray(flat.detailDocuments)
      ? {
        observedAt: null,
        documents: legacyDocuments(flat.detailDocuments),
        raw: {},
      }
      : null);
  return {
    list,
    detail,
    catalogExcel: section(CatalogExcelSectionSchema, flat.catalogExcel, 'catalogExcel', context),
  };
}

export function readOptionRawSections(raw: unknown, context: RawSectionReadContext = {}): OptionRawSections {
  const flat = record(raw) ?? {};
  const detail = section(OptionDetailSectionSchema, flat.detail, 'detail', context)
    ?? (Array.isArray(flat.detailDocumentIds)
      ? {
        observedAt: null,
        documentIds: legacyDocumentIds(flat.detailDocumentIds),
        raw: {},
      }
      : null);
  return {
    list: section(OptionListSectionSchema, flat.list, 'list', context),
    detail,
    catalogExcel: section(OptionCatalogExcelSectionSchema, flat.catalogExcel, 'catalogExcel', context),
  };
}

type SectionValue = {
  list: ListingListSection | OptionListSection;
  detail: ListingDetailSection | OptionDetailSection;
  catalogExcel: CatalogExcelSection | OptionCatalogExcelSection;
};

const SECTION_SCHEMAS = {
  list: z.union([ListingListSectionSchema, OptionListSectionSchema]),
  detail: z.union([ListingDetailSectionSchema, OptionDetailSectionSchema]),
  catalogExcel: z.union([CatalogExcelSectionSchema, OptionCatalogExcelSectionSchema]),
} as const;

/**
 * `||` 병합에 넣을 patch. 자기 구역 하나와 공유 평면 키만 담으므로 다른 경로의 구역은
 * 그대로 남는다. 구역 값은 쓰기 전에 스키마로 검증한다.
 */
export function rawSectionPatch<S extends ListingRawSection>(
  name: S,
  value: SectionValue[S],
  shared: Partial<Record<SharedListingRawKey, unknown>> = {},
): Record<string, unknown> {
  const patch: Record<string, unknown> = { [name]: SECTION_SCHEMAS[name].parse(value) };
  for (const key of SHARED_LISTING_RAW_KEYS) {
    if (shared[key] !== undefined) patch[key] = shared[key];
  }
  return patch;
}

/**
 * 같은 상세를 다시 받았는지. 저장된 구역과 들어온 문서·raw를 정규화해 비교하며, 관측 시각은
 * 비교에서 뺀다. 해시는 저장하지 않고 비교할 때만 계산한다(KID-338 21:52).
 */
export function detailSectionUnchanged(
  existing: ListingDetailSection | OptionDetailSection | null,
  incoming: Omit<ListingDetailSection, 'observedAt'> | Omit<OptionDetailSection, 'observedAt'>,
): boolean {
  if (!existing) return false;
  // 관측 시각과 반영 기준 modifiedOn은 상세 내용이 아니다.
  const { observedAt: _ignored, modifiedOn: _basis, ...stored } = existing as ListingDetailSection;
  return stableStringify(stored) === stableStringify(incoming);
}
