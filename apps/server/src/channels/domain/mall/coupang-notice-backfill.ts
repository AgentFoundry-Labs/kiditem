import { missingNoticeFields, NOTICE_REQUIRED_FIELDS } from './product-notice-fields';

/**
 * 쿠팡 Wing 상품목록에서 상품정보고시를 역추출한다.
 *
 * 저장돼 있는 `ChannelListing.rawJson` 은 Wing 상품목록 엑셀이다. 여기에는
 * 제조사·카테고리·검색옵션(최소 연령/색상계열/사이즈)이 있고, **제조국·KC 인증번호·
 * A/S 책임자는 없다.** 그래서 이 역추출만으로는 어떤 상품도 송신 가능해지지
 * 않는다 — 채울 수 있는 것만 채우고 나머지는 비워 둔 채로 게이트에 걸리게 둔다.
 *
 * 순수 함수다.
 */

/** 이 소스가 채울 수 있는 고시 항목. 나머지는 다른 원천이 필요하다. */
export const COUPANG_BACKFILLABLE_FIELDS = ['제조자', '사용연령', '색상', '크기', '품명및모델명'] as const;

/** 어떤 원천으로도 Wing 상품목록에는 없는 항목. */
export const COUPANG_UNAVAILABLE_FIELDS = ['제조국', 'KC인증필유무', 'AS책임자'] as const;

export interface CoupangSearchOption {
  type: string;
  value: string;
}

export interface CoupangNoticeSource {
  masterProductId: string;
  productName: string;
  /** `[64681] 생활용품>생활잡화>...` 형태. */
  category: string | null;
  manufacturer: string | null;
  brand: string | null;
  modelNumber: string | null;
  searchOptions: readonly CoupangSearchOption[];
}

export interface CoupangNoticeDraft {
  masterProductId: string;
  noticeCategory: string;
  /** 고시 카테고리를 카테고리 경로로 확신할 수 있었는가. false 면 운영자 확인이 필요하다. */
  categoryConfident: boolean;
  attributes: Record<string, string>;
  filledFields: string[];
  missingFields: string[];
}

/** `[11932]최소 연령\n(기본 단위 : 개월)` → `최소 연령` */
export function normalizeOptionType(raw: string): string {
  return raw
    .replace(/^\s*\[\d+\]\s*/, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `[64681] 생활용품>생활잡화>기타생활용품` → ['생활용품','생활잡화','기타생활용품'] */
export function categorySegments(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .replace(/^\s*\[\d+\]\s*/, '')
    .split('>')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

const CHILD_ROOTS = ['완구/취미'];
const CHILD_SEGMENT_HINTS = ['유아', '신생아', '영아', '어린이', '학용품', '아동'];

/**
 * 고시 카테고리 판정.
 *
 * 확신할 수 있을 때만 `confident: true` 다. 확신하지 못하면 기타재화로 두되
 * 운영자가 고치도록 표시한다 — 어느 쪽이든 제조국·KC·A/S 가 비어 있어서 게이트를
 * 통과하지 못하므로, 오분류가 잘못된 송신으로 이어지지 않는다.
 */
export function resolveNoticeCategory(
  category: string | null,
): { noticeCategory: string; confident: boolean } {
  const segments = categorySegments(category);
  if (segments.length === 0) return { noticeCategory: '기타재화', confident: false };
  const root = segments[0] ?? '';
  if (CHILD_ROOTS.includes(root)) return { noticeCategory: '어린이제품', confident: true };
  if (segments.some((segment) => CHILD_SEGMENT_HINTS.some((hint) => segment.includes(hint)))) {
    return { noticeCategory: '어린이제품', confident: true };
  }
  return { noticeCategory: '기타재화', confident: false };
}

const OPTION_TO_FIELD: ReadonlyArray<{ field: string; matches: readonly string[]; priority: number }> = [
  { field: '사용연령', matches: ['최소 연령', '연령', '사용연령'], priority: 0 },
  { field: '색상', matches: ['색상계열', '색상'], priority: 0 },
  { field: '크기', matches: ['사이즈'], priority: 0 },
  // 사이즈가 없을 때만 길이를 크기로 쓴다.
  { field: '크기', matches: ['길이'], priority: 1 },
];

function pickFromSearchOptions(options: readonly CoupangSearchOption[]): Record<string, string> {
  const best = new Map<string, { value: string; priority: number }>();
  for (const option of options) {
    const type = normalizeOptionType(option.type);
    const value = option.value.trim();
    if (!type || !value) continue;
    for (const rule of OPTION_TO_FIELD) {
      if (!rule.matches.some((match) => type === match || type.startsWith(match))) continue;
      const current = best.get(rule.field);
      if (!current || rule.priority < current.priority) {
        best.set(rule.field, { value, priority: rule.priority });
      }
    }
  }
  return Object.fromEntries([...best].map(([field, entry]) => [field, entry.value]));
}

export function buildCoupangNoticeDraft(source: CoupangNoticeSource): CoupangNoticeDraft {
  const { noticeCategory, confident } = resolveNoticeCategory(source.category);
  const attributes: Record<string, string> = {};

  const manufacturer = source.manufacturer?.trim() || source.brand?.trim() || '';
  if (manufacturer) attributes['제조자'] = manufacturer;

  const modelName = source.modelNumber?.trim() || source.productName.trim();
  if (modelName) attributes['품명및모델명'] = modelName;

  Object.assign(attributes, pickFromSearchOptions(source.searchOptions));

  const required = NOTICE_REQUIRED_FIELDS[noticeCategory] ?? [];
  // 필수가 아닌 항목까지 굳이 남기지 않는다. 고시 화면이 읽는 건 필수 집합이다.
  for (const field of Object.keys(attributes)) {
    if (!required.includes(field)) delete attributes[field];
  }

  return {
    masterProductId: source.masterProductId,
    noticeCategory,
    categoryConfident: confident,
    attributes,
    filledFields: Object.keys(attributes),
    missingFields: missingNoticeFields(noticeCategory, attributes),
  };
}
