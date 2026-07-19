export const SOURCING_SELLPIA_SALE_PRICE_PORT = Symbol(
  'SOURCING_SELLPIA_SALE_PRICE_PORT',
);

/**
 * 이름으로 확정된 셀피아 판매가 한 건.
 *
 * `salePrice` 는 항상 0보다 크다. 값이 없거나(null/0) 같은 이름에 서로 다른
 * 가격이 걸린 SKU 는 어댑터가 결과에서 제외하므로, 소비자는 "없음"과 "0원"을
 * 구분할 필요가 없다 — 배열에 없으면 매칭 실패다.
 */
export interface SellpiaSalePriceMatch {
  normalizedName: string;
  salePrice: number;
}

/**
 * Sourcing 이 Inventory 의 물리 `SellpiaInventorySku` 판매가를 읽기 위한
 * anti-corruption 아웃고잉 포트.
 *
 * 이름 조인 키는 `domain/sellpia-name-key.ts` 의 `sellpiaNameJoinKey` 로 만든다.
 * 호출자가 정규화 책임을 진다 — Inventory 는 넘어온 키를 그대로 비교한다.
 *
 * 배열 in/out 인 이유: 지금 소비자는 후보 상세 1건이지만, 목록 경로가 붙어도
 * N+1 없이 그대로 쓸 수 있어야 한다.
 */
export interface SellpiaSalePricePort {
  findSalePricesByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaSalePriceMatch[]>;
}
