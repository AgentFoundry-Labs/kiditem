import { listingStatusReportsSoldOut } from '../listing/mall-listing-state';

/** 판매를 멈췄다는 원문 상태(품절 류 + 판매중지 류). */
function reportsStopped(status: string | null): boolean {
  if (!status) return false;
  if (listingStatusReportsSoldOut(status)) return true;
  const lowered = status.trim().toLowerCase().replace(/[\s_-]/g, '');
  return lowered.includes('판매중지') || lowered.includes('판매중단') || lowered === 'suspension' || lowered === 'suspended'
    || lowered === 'stopped' || lowered === 'offsale';
}

/**
 * 품절 · 재개를 보낸 뒤 몰에서 다시 읽은 옵션 한 줄이 그 지시를 확인하는가(KID-364). 품절은 재고 0 이나 판매를 멈춘 상태,
 * 재개는 멈추지 않은 상태이면서 재고가 0 이 아닌 것 — 재고와 상태를 둘 다 모르면 확인이 아니다.
 */
export function observedOptionConfirms(
  action: 'sold_out' | 'resume',
  observed: { stock: number | null; status: string | null },
): boolean {
  if (observed.stock === null && observed.status === null) return false;
  if (action === 'sold_out') return observed.stock === 0 || reportsStopped(observed.status);
  return !reportsStopped(observed.status) && observed.stock !== 0;
}
