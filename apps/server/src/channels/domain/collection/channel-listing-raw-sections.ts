import { z } from 'zod';
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
 */
export const SHARED_LISTING_RAW_KEYS = [
  'source',
  'externalProductId',
  'createdOn',
  'saleStatus',
  'productStatus',
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
}).strict();
export type ListingDetailSection = z.infer<typeof ListingDetailSectionSchema>;

export const CatalogExcelSectionSchema = z.object({
  /** 내보내기를 요청한 시각. 엑셀 값은 이 시각 기준 스냅샷이다. */
  observedAt: ObservedAtSchema,
  /** 한글 헤더 → 셀 값. 빈 셀은 `null`. */
  row: z.record(z.string().nullable()),
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
  catalogExcel: CatalogExcelSection | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function section<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (value === undefined || value === null) return null;
  return schema.parse(value);
}

/** 구역이 있으면 구역을, 없으면 구역 이전 평면 키를 같은 모양으로 돌려준다. */
export function readListingRawSections(raw: unknown): ListingRawSections {
  const flat = record(raw) ?? {};
  const list = section(ListingListSectionSchema, flat.list)
    ?? (text(flat.modifiedOn) !== null || text(flat.createdOn) !== null
      ? {
        observedAt: null,
        modifiedOn: text(flat.modifiedOn),
        createdOn: text(flat.createdOn),
        productStatus: text(flat.productStatus),
        raw: {},
      }
      : null);
  const detail = section(ListingDetailSectionSchema, flat.detail)
    ?? (Array.isArray(flat.detailDocuments)
      ? {
        observedAt: null,
        documents: z.array(ListingDetailDocumentSchema).parse(flat.detailDocuments),
        raw: {},
      }
      : null);
  return {
    list,
    detail,
    catalogExcel: section(CatalogExcelSectionSchema, flat.catalogExcel),
  };
}

export function readOptionRawSections(raw: unknown): OptionRawSections {
  const flat = record(raw) ?? {};
  const detail = section(OptionDetailSectionSchema, flat.detail)
    ?? (Array.isArray(flat.detailDocumentIds)
      ? {
        observedAt: null,
        documentIds: z.array(z.string().min(1)).parse(flat.detailDocumentIds),
        raw: {},
      }
      : null);
  return {
    list: section(OptionListSectionSchema, flat.list),
    detail,
    catalogExcel: section(CatalogExcelSectionSchema, flat.catalogExcel),
  };
}

type SectionValue = {
  list: ListingListSection | OptionListSection;
  detail: ListingDetailSection | OptionDetailSection;
  catalogExcel: CatalogExcelSection;
};

const SECTION_SCHEMAS = {
  list: z.union([ListingListSectionSchema, OptionListSectionSchema]),
  detail: z.union([ListingDetailSectionSchema, OptionDetailSectionSchema]),
  catalogExcel: CatalogExcelSectionSchema,
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
  const { observedAt: _ignored, ...stored } = existing;
  return stableStringify(stored) === stableStringify(incoming);
}
