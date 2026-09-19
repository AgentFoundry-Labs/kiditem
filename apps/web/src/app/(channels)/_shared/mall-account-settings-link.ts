/**
 * 쇼핑몰 계정 설정 창의 주소. 계정 화면은 쇼핑몰 현황의 설정 창이 됐다(사장님 2026-09-19) — 다른 화면이 계정으로
 * 보낼 때 이 주소를 쓴다. 값은 몰 계정 키 하나, 또는 모든 몰(`all`)이다.
 */
export const MALL_ACCOUNT_SETTINGS_PARAM = 'account';

export const MALL_ACCOUNT_SETTINGS_HREF = `/mall-channels?${MALL_ACCOUNT_SETTINGS_PARAM}=all`;

/** 표의 몰 키 → 쇼핑몰 계정 키. 쿠팡 로켓의 자격증명은 계정에서 '쿠팡직배송' 행이다(ADR-0012). */
export function mallAccountKeyFor(mallKey: string): string {
  return mallKey === 'rocket' ? 'coupang-direct' : mallKey;
}
