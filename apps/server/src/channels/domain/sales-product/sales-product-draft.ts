import {
  SALES_PRODUCT_MAX_OPTIONS,
  SALES_PRODUCT_OPTION_FORBIDDEN_CHARS,
  type SalesProductOptionSupplyStatus,
  type SalesProductStatus,
} from '@kiditem/shared/sales-product';

/**
 * 판매상품 초안 규칙 — 순수 함수만 둔다(KID-310).
 *
 * 수집상품과 판매상품은 공존하지 않는다. 수집 · 직접 작성 모두 판매상품 하나를 `draft` 로 만들고,
 * 썸네일 · 상세 · 정보 · 가격을 거기서 손본다. "판매가 확인"은 별도 버튼이 아니라 저장이다 —
 * 판매 옵션에 값이 다 차면 저장이 상태를 `active` 로 올린다.
 */

/** 저장할 때마다 다시 판정하는 상태. */
const DERIVED_STATUSES = ['draft', 'active'] as const;

export interface SalesProductPricedOption {
  id: string;
  supplyStatus: SalesProductOptionSupplyStatus;
  salePrice: number | null;
}

/** 상태 판정에는 값만 있으면 된다 — 저장 전 계획(PlannedOptionWrite)도 그대로 넘긴다. */
export type SalesProductOptionPrice = Pick<SalesProductPricedOption, 'supplyStatus' | 'salePrice'>;

/**
 * 저장 뒤 상태. 판매(selling) 옵션에 판매가가 하나라도 비어 있으면 `draft`, 값이 다 차 있으면
 * `active` 다.
 *
 * 팔 옵션이 하나도 없는 것은 "값이 비었다"와 다른 사실이라 상태를 바꾸지 않는다 — 팔던 상품의
 * 옵션을 모두 내렸다고 이미 몰에 올라간 상품이 초안으로 돌아가면 안 된다.
 * `paused` · `sold_out` · `unused` · `archived` 는 사람이 정한 상태라 값이 차도 건드리지 않는다.
 */
export function resolveSalesProductStatus(input: {
  current: SalesProductStatus;
  options: readonly SalesProductOptionPrice[];
}): SalesProductStatus {
  if (!(DERIVED_STATUSES as readonly string[]).includes(input.current)) return input.current;
  const selling = input.options.filter((option) => option.supplyStatus === 'selling');
  if (selling.length === 0) return input.current;
  return selling.some((option) => option.salePrice === null) ? 'draft' : 'active';
}

export class SalesProductDraftError extends Error {}

/**
 * 등록 동결 · 몰 엑셀 · 품절 송신이 함께 쓰는 단일 가격 게이트. 값이 확정된 판매 옵션을 돌려주고,
 * 아니면 한 가지 오류로 거절한다 — 세 화면이 같은 문장을 보여야 사장님이 어디를 고칠지 안다.
 *
 * 묻는 것은 **아직 초안인가**이지 지금 팔고 있는가가 아니다. 잠시 내려둔 상품(`paused`)과 품절
 * 표시를 한 상품(`sold_out`)은 값이 확정된 상품이고, 품절 송신이 다루는 것이 바로 그 상품이다.
 */
const UNCONFIRMED_STATUSES = new Set<SalesProductStatus>(['draft', 'archived', 'unused']);

export function requireConfirmedPrice(product: {
  name: string;
  status: SalesProductStatus;
  options: readonly SalesProductPricedOption[];
}): { id: string; salePrice: number }[] {
  if (product.status === 'archived' || product.status === 'unused') {
    throw new SalesProductDraftError(
      `'${product.name}' 은(는) 보관한 판매상품입니다. 다시 쓰려면 판매상품에서 상태를 되돌리세요.`,
    );
  }
  const selling = product.options.filter((option) => option.supplyStatus === 'selling');
  const confirmed = selling.filter((option): option is SalesProductPricedOption & { salePrice: number } =>
    option.salePrice !== null && option.salePrice > 0);
  if (UNCONFIRMED_STATUSES.has(product.status) || selling.length === 0 || confirmed.length !== selling.length) {
    throw new SalesProductDraftError(
      `'${product.name}' 은(는) 아직 판매가를 정하지 않은 초안입니다. 판매상품에서 팔 옵션의 판매가를 채운 뒤 다시 시도하세요.`,
    );
  }
  return confirmed.map((option) => ({ id: option.id, salePrice: option.salePrice }));
}

/**
 * 판매상품 글 칸의 너비. `prisma/models/channels.prisma` 의 `@db.VarChar` 와 같은 수다.
 *
 * 원천(1688 상품 이름 · 이관하는 옛 편집값)은 이 너비를 지킨 적이 없다. 화면에서 사람이 쓴 값은
 * 공유 스키마가 막지만, 원천에서 들어오는 값은 막을 수 없다 — 막으면 수집이 통째로 실패한다.
 * 그래서 원천 값은 거절이 아니라 이 너비로 자른다. 이관과 수집이 같은 수를 본다.
 */
export const SALES_PRODUCT_TEXT_LIMITS = {
  name: 255,
  brand: 50,
  manufacturer: 50,
  originCountry: 50,
  modelName: 60,
  modelNo: 60,
  importDeclarationNo: 60,
  standardCategory: 40,
  noticeCategory: 10,
  targetAudience: 200,
  ageGroup: 100,
  productSize: 200,
  sourcePlatform: 40,
} as const;

export type SalesProductTextField = keyof typeof SALES_PRODUCT_TEXT_LIMITS;

/** 너비를 넘는 원문을 자른다. 잘랐는지도 함께 돌려준다 — 이관이 건수를 보고한다. */
export function clampDraftText(
  field: SalesProductTextField,
  value: string | null | undefined,
): { value: string | null; truncated: boolean } {
  if (value === null || value === undefined) return { value: null, truncated: false };
  const limit = SALES_PRODUCT_TEXT_LIMITS[field];
  if (value.length <= limit) return { value, truncated: false };
  return { value: value.slice(0, limit), truncated: true };
}

/** 초안 옵션 한 단의 이름. 원천이 옵션을 주지 않으면 옵션 없는 단품 하나다. */
export const DRAFT_OPTION_AXIS = '옵션';

/**
 * 원천이 준 옵션 이름으로 초안 옵션 판을 짠다.
 *
 * 몰이 거절하는 글자는 지우고(옵션을 통째로 버리지 않는다), 빈 이름과 중복은 버린다. 남는 이름이
 * 없으면 옵션 없는 단품 하나로 떨어진다. 가격은 여기서 정하지 않는다 — 초안은 비어 있다.
 */
export function planDraftOptions(optionNames?: readonly string[]): {
  optionAxes: string[];
  optionValues: string[][];
} {
  const names: string[] = [];
  for (const raw of optionNames ?? []) {
    const cleaned = SALES_PRODUCT_OPTION_FORBIDDEN_CHARS
      .reduce((value, char) => value.split(char).join(''), String(raw ?? ''))
      .trim()
      .slice(0, 100);
    if (cleaned && !names.includes(cleaned)) names.push(cleaned);
    if (names.length >= SALES_PRODUCT_MAX_OPTIONS) break;
  }
  if (names.length === 0) return { optionAxes: [], optionValues: [[]] };
  return { optionAxes: [DRAFT_OPTION_AXIS], optionValues: names.map((name) => [name]) };
}
