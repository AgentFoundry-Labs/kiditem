import type { SalesProductChannelOverride } from '@kiditem/shared/sales-product';

/**
 * 공급가를 따로 받는 몰 — 우리가 몰에 넘기는 값과 소비자가 보는 값이 다르다.
 *
 * 온채널이 그렇다. 판매가에서 역산하지 않는다(거래 조건이라 사람이 정한다). 몰별 값 `supplyPrice` 에 저장하고,
 * 온채널 대량등록 엑셀이 그 값을 읽는다.
 */
export const SUPPLY_PRICE_MALLS: ReadonlySet<string> = new Set(['onch']);

/**
 * 공급가만 바꾼 몰별 값. 사방넷에서 옮긴 분류 · 부가정보는 그대로 들고 간다 — 저장은 이 묶음을 통째로 덮어쓴다.
 * 공급가를 비우면 칸을 지우고, 남는 값이 없으면 `null`(몰별 값 없음)을 돌려준다.
 */
export function nextAdapterValues(
  override: Pick<SalesProductChannelOverride, 'adapterValues'> | undefined,
  supplyPrice: string,
): Record<string, string> | null {
  const values = { ...(override?.adapterValues ?? {}) };
  const price = supplyPrice.replace(/[,\s]/g, '');
  const parsed = Number(price);
  if (price && Number.isFinite(parsed) && parsed > 0) values.supplyPrice = String(Math.round(parsed));
  else delete values.supplyPrice;
  return Object.keys(values).length ? values : null;
}
