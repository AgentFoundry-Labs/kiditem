import {
  SALES_PRODUCT_MAX_OPTIONS,
  SALES_PRODUCT_OPTION_FORBIDDEN_CHARS,
  type SalesProductOptionSupplyStatus,
  type SalesProductStatus,
} from '@kiditem/shared/sales-product';

/**
 * 판매상품 초안 규칙 — 순수 함수만 둔다(KID-310 · KID-313).
 *
 * 수집 · 직접 작성 모두 판매상품 하나를 `draft` 로 만들고, 썸네일 · 상세 · 정보 · 가격을 거기서
 * 손본다. 상태는 가격이 아니라 KID 가 정한다(`sales-product-status.ts`) — 여기는 가격 게이트와
 * 원천 글 · 옵션을 초안 칸에 맞추는 규칙만 둔다.
 */

export interface SalesProductPricedOption {
  id: string;
  supplyStatus: SalesProductOptionSupplyStatus;
  salePrice: number | null;
}

export class SalesProductDraftError extends Error {}

/**
 * 등록 동결 · 몰 엑셀 · 품절 송신이 함께 쓰는 단일 가격 게이트. 값이 확정된 판매 옵션을 돌려주고,
 * 아니면 한 가지 오류로 거절한다 — 세 화면이 같은 문장을 보여야 사장님이 어디를 고칠지 안다.
 *
 * 묻는 것은 가격뿐이다. 초안인지는 KID 가 말하고(몰 엑셀은 값이 찬 초안에 그 자리에서 KID 를
 * 발급한다), 보관한 상품만 상태로 거절한다 — 판매를 접은 상품이다.
 */
export function requireConfirmedPrice(product: {
  name: string;
  status: SalesProductStatus;
  options: readonly SalesProductPricedOption[];
}): { id: string; salePrice: number }[] {
  if (product.status === 'archived') {
    throw new SalesProductDraftError(
      `'${product.name}' 은(는) 보관한 판매상품이라 몰에 보내지 않습니다.`,
    );
  }
  const selling = product.options.filter((option) => option.supplyStatus === 'selling');
  const confirmed = selling.filter((option): option is SalesProductPricedOption & { salePrice: number } =>
    option.salePrice !== null && option.salePrice > 0);
  if (selling.length === 0 || confirmed.length !== selling.length) {
    throw new SalesProductDraftError(
      `'${product.name}' 은(는) 아직 판매가를 정하지 않은 상품입니다. 판매상품에서 팔 옵션의 판매가를 채운 뒤 다시 시도하세요.`,
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
