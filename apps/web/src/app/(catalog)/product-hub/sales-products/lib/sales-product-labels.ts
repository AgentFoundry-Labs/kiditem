import type {
  SalesProductDeliveryFeeType,
  SalesProductOptionSupplyStatus,
  SalesProductStatus,
  SalesProductTaxType,
} from '@kiditem/shared/sales-product';

/** 사방넷에서 쓰던 말 그대로 — 사장님이 익숙한 이름. */
export const SALES_PRODUCT_STATUS_LABEL: Record<SalesProductStatus, string> = {
  /** 판매 옵션 중 하나라도 가격이 없다 — 수집·직접 작성 직후의 초안(KID-310). */
  draft: '초안(미발급)',
  active: '공급중',
  paused: '일시중지',
  sold_out: '완전품절',
  unused: '미사용',
  /** 단순 보관 — 되돌림 표식이 아니다(KID-310). */
  archived: '보관',
};

export const SALES_PRODUCT_STATUS_TONE: Record<SalesProductStatus, string> = {
  draft: 'bg-sky-100 text-sky-800',
  active: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-amber-100 text-amber-800',
  sold_out: 'bg-rose-100 text-rose-800',
  unused: 'bg-slate-100 text-slate-500',
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
