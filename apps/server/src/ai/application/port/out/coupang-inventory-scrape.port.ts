/**
 * Outgoing port for Coupang Wing vendor-inventory list 스크래핑.
 *
 * Application services depend on this contract, not the concrete Playwriter
 * adapter. Scrape 작업의 외부 환경 의존 (host playwriter binary, active
 * session) 을 application 레이어에서 격리한다.
 *
 * Bound in `ai.module.ts` to the concrete `CoupangInventoryScrapeAdapter`
 * provider via `COUPANG_INVENTORY_SCRAPE_PORT` token.
 */

export const COUPANG_INVENTORY_SCRAPE_PORT = Symbol('COUPANG_INVENTORY_SCRAPE_PORT');

export interface CoupangInventoryRow {
  inventoryId: string;
  legacyCode?: string | null;
  name: string;
  url: string;
}

export interface CoupangInventoryScrapePort {
  /**
   * Wing vendor-inventory 페이지를 순회하며 (inventoryId, name, image url)
   * row 들을 추출. host 환경에 playwriter binary + 활성 세션이 없으면 throw.
   */
  scrapeAll(): Promise<CoupangInventoryRow[]>;
}
