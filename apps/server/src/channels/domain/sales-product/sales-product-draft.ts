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

/**
 * 저장 뒤 상태. 판매(selling) 옵션에 판매가가 하나라도 비었거나 판매 옵션 자체가 없으면 `draft`,
 * 값이 다 차 있으면 `active` 다.
 *
 * `paused` · `sold_out` · `unused` · `archived` 는 사람이 정한 상태라 값이 차도 건드리지 않는다.
 */
export function resolveSalesProductStatus(input: {
  current: SalesProductStatus;
  options: readonly SalesProductPricedOption[];
}): SalesProductStatus {
  if (!(DERIVED_STATUSES as readonly string[]).includes(input.current)) return input.current;
  const selling = input.options.filter((option) => option.supplyStatus === 'selling');
  if (selling.length === 0) return 'draft';
  return selling.some((option) => option.salePrice === null) ? 'draft' : 'active';
}

export class SalesProductDraftError extends Error {}

/**
 * 등록 동결 · 몰 엑셀 · 품절 송신이 함께 쓰는 단일 가격 게이트. 값이 확정된 판매 옵션을 돌려주고,
 * 아니면 한 가지 오류로 거절한다 — 세 화면이 같은 문장을 보여야 사장님이 어디를 고칠지 안다.
 */
export function requireConfirmedPrice(product: {
  name: string;
  status: SalesProductStatus;
  options: readonly SalesProductPricedOption[];
}): { id: string; salePrice: number }[] {
  const selling = product.options.filter((option) => option.supplyStatus === 'selling');
  const confirmed = selling.filter((option): option is SalesProductPricedOption & { salePrice: number } =>
    option.salePrice !== null && option.salePrice > 0);
  if (product.status !== 'active' || selling.length === 0 || confirmed.length !== selling.length) {
    throw new SalesProductDraftError(
      `'${product.name}' 은(는) 아직 판매가를 정하지 않은 초안입니다. 판매상품에서 팔 옵션의 판매가를 채운 뒤 다시 시도하세요.`,
    );
  }
  return confirmed.map((option) => ({ id: option.id, salePrice: option.salePrice }));
}

export type KidIssueMoment = 'draft_created' | 'first_active';

/**
 * KID(판매상품코드 · 단품코드) 발급 시점(사장님 결정 2026-09-23).
 *
 * 지금은 초안을 만들 때 바로 준다. 안 파는 초안이 번호를 소모해 구멍이 생기지만 KID 는 8자리
 * 조회 키라 무해하다. 첫 `active` 전환 시 발급으로 바꾸려면 이 상수 하나만 옮긴다 — 발급을
 * 부르는 곳은 모두 `issuesKidCodes` 에게 묻는다.
 */
export const KID_ISSUE_MOMENT: KidIssueMoment = 'draft_created';

export function issuesKidCodes(moment: KidIssueMoment): boolean {
  return moment === KID_ISSUE_MOMENT;
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
