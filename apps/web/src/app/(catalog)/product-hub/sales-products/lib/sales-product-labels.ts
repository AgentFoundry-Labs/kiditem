import type {
  SalesProductDeliveryFeeType,
  SalesProductOptionSupplyStatus,
  SalesProductStatus,
  SalesProductTaxType,
} from '@kiditem/shared/sales-product';

/**
 * 판매상품 상태는 셋이다(KID-313). 품절 · 일시중지는 상품이 아니라 옵션 공급상태와 몰 쪽 상태가
 * 말한다.
 */
export const SALES_PRODUCT_STATUS_LABEL: Record<SalesProductStatus, string> = {
  /** KID 를 아직 받지 않은 초안. */
  draft: '초안(미발급)',
  active: '판매 중',
  /** 판매를 접은 판매 상품. 되돌리지 않는다. */
  archived: '보관',
};

export const SALES_PRODUCT_STATUS_TONE: Record<SalesProductStatus, string> = {
  draft: 'bg-sky-100 text-sky-800',
  active: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-slate-200 text-slate-500',
};

export const OPTION_SUPPLY_LABEL: Record<SalesProductOptionSupplyStatus, string> = {
  selling: '판매',
  sold_out: '품절',
  unused: '미사용',
};

export const OPTION_SUPPLY_TONE: Record<SalesProductOptionSupplyStatus, string> = {
  selling: 'bg-emerald-600 text-white',
  sold_out: 'bg-rose-600 text-white',
  unused: 'bg-slate-300 text-slate-700',
};

export const TAX_TYPE_LABEL: Record<SalesProductTaxType, string> = {
  taxable: '과세',
  tax_free: '면세',
  zero_rated: '영세',
  unknown: '자료없음',
};

export const DELIVERY_FEE_TYPE_LABEL: Record<SalesProductDeliveryFeeType, string> = {
  free: '무료',
  collect: '착불',
  prepay: '선결제',
  collect_or_prepay: '착불/선결제',
};

export function formatWon(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toLocaleString('ko-KR')}원`;
}
