/**
 * Outgoing port for Coupang Wing vendor-inventory **단일 상품** 스크래핑.
 *
 * `ThumbnailTracking` 의 30일 매출 시계열 수집용. Playwriter 가 Wing 검색 URL
 * (`searchKeywords=<productName>`) 로 진입해서 일치 row 한 개의 판매량/매출
 * 셀을 추출한다. `CoupangInventoryScrapePort` 와 다른 점:
 *  - 50 페이지 순회 X — 검색 결과 1페이지에서 매칭 row 한 개만.
 *  - inventoryId/url 외에 sold/revenue 같은 numeric 셀까지 추출.
 *
 * Bound in `ai.module.ts` to `CoupangProductSalesScrapeAdapter` via
 * `COUPANG_PRODUCT_SALES_SCRAPE_PORT` token.
 */

export const COUPANG_PRODUCT_SALES_SCRAPE_PORT = Symbol('COUPANG_PRODUCT_SALES_SCRAPE_PORT');

export interface CoupangProductSalesRow {
  /** Wing inventoryId (data-inventory 속성). 매칭 row 의 ID. */
  inventoryId: string;
  /** 매칭 row 의 상품명 (Wing 화면에 보이는 것 그대로). */
  matchedName: string;
  /** 최근 30일 누적 판매량 (개). 못 찾으면 null. */
  unitsSold30d: number | null;
  /** 최근 7일 누적 판매량 (개). 못 찾으면 null. */
  unitsSold7d: number | null;
  /** 매출 (KRW). 못 찾으면 null. */
  revenueKrw: number | null;
  /** 리뷰 개수. 못 찾으면 null. */
  reviewCount: number | null;
  /** 평균 별점. 못 찾으면 null. */
  ratingAvg: number | null;
  /**
   * 매칭 row 의 모든 td cell text 를 그대로 보존. Wing DOM 변경 시 재파싱
   * 가능하도록 raw 형태 유지. snapshot 테이블에 Json 으로 저장.
   */
  rawCellTexts: string[];
}

export interface CoupangProductSalesScrapeResult {
  /** 검색에서 매칭 row 를 찾았는지. false 면 row 가 null. */
  found: boolean;
  row: CoupangProductSalesRow | null;
  /** scrape 자체 실패 (Wing 로그인 필요, playwriter 죽음 등) 시 메시지. */
  error?: string;
}

export interface CoupangProductSalesScrapePort {
  /**
   * Wing vendor-inventory 검색에서 productName 일치 row 1개의 판매/매출 데이터를 추출.
   * host 환경에 playwriter binary + 활성 세션이 없으면 throw.
   */
  scrapeByProductName(productName: string): Promise<CoupangProductSalesScrapeResult>;
}
