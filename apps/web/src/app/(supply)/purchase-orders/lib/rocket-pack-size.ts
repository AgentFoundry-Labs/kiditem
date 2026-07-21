/**
 * 쿠팡 로켓 상품명에서 "1발주 = 셀피아 몇 개(팩 크기)"를 뽑는다.
 *
 * 셀피아 재고는 낱개(1개) 기준이고 쿠팡 로켓은 "18개입"처럼 묶음으로 발주된다.
 * 따라서 가용 발주수량 = floor(셀피아 낱개 재고 / 팩 크기) 로 환산해야 한다.
 * 예: "Pack_1000 불빛 슈팅 낙하산 (18개입)" → 18, "베베 러브덕 비눗방울 노랑 24개" → 24,
 *     "곰돌이전동카메라 비눗방울 혼합색상 1개" → 1. 수량 표기가 없으면 1(낱개).
 */
export function parseCoupangPackSize(name: string): number {
  const text = String(name ?? '');
  // "18개입"(묶음 명시)을 먼저, 없으면 "24개"/"6개"(개월 등 제외).
  const match = text.match(/(\d+)\s*개\s*입/) ?? text.match(/(\d+)\s*개(?!\s*월)/);
  const size = match ? Number.parseInt(match[1]!, 10) : 1;
  return Number.isFinite(size) && size > 0 ? size : 1;
}

/** 셀피아 낱개 재고 → 쿠팡 로켓 가용 발주수량(팩 단위, 내림). */
export function availablePacks(sellpiaUnitStock: number, packSize: number): number {
  if (packSize <= 0) return sellpiaUnitStock;
  return Math.floor(Math.max(0, sellpiaUnitStock) / packSize);
}
