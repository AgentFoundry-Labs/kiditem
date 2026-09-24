import type { SalesProduct } from '@kiditem/shared/sales-product';

type KcStatus = SalesProduct['kcStatus'];
export type KcStatusSelectValue = '' | 'none' | 'exists';

/**
 * KC 인증 상태 고르기 칸 하나(수집상품 기본 정보 · 판매상품 편집이 같이 쓴다, KID-310 c).
 * 저장 값 `unknown` 은 칸에서 빈 선택('확인 필요')이다 — 그 짝맞춤은 여기 한 곳만 한다.
 */
export const KC_STATUS_SELECT_OPTIONS: readonly { value: KcStatusSelectValue; label: string }[] = [
  { value: '', label: '확인 필요' },
  { value: 'none', label: '없음' },
  { value: 'exists', label: '있음' },
];

export function kcStatusSelectValue(status: KcStatus): KcStatusSelectValue {
  return status === 'unknown' ? '' : status;
}

export function kcStatusFromSelectValue(value: string | null | undefined): KcStatus {
  return value === 'none' || value === 'exists' ? value : 'unknown';
}
