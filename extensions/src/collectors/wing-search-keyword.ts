import { RuntimeError } from '../core/errors';

/** Wing 상품등록 검색 한 쪽(`sites/wing/pre-matching-search`가 구현). 행 모양은 수집기가 정한다. */
export interface WingSearchKeywordSite<TRow> {
  searchPage(keyword: string, searchPage: number): Promise<{ rows: TRow[]; nextSearchPage: number | null }>;
}

/** Wing 검색 행 중 광고 kind가 읽는 칸(`sites/wing/pre-matching-search`의 `WingSearchRow`와 같은 이름). */
export interface WingSearchMetricsRow {
  productId: string;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string;
  categoryHierarchy: string | null;
  salePrice: number | null;
  rating: number | null;
  ratingCount: number | null;
  pvLast28Day: number | null;
  salesLast28d: number | null;
  estimatedRevenue28d: number | null;
  conversionRate28d: number | null;
}

export const ADVERTISING_COLLECTION_INCOMPLETE = 'ADVERTISING_COLLECTION_INCOMPLETE' as const;

/**
 * 키워드 하나를 최대 `maxPages`쪽 읽어 행을 모은다(같은 상품·옵션은 한 번). 결과가 비거나 마지막 쪽이면 멈추고,
 * 쪽 상한 전에 Wing이 다음 쪽으로 넘어가지 않으면 부분 결과로 실패한다(옛 수집기의 불완전 증거 규칙). 중단되면 null.
 * 키워드 사이 간격은 사이트 호출기의 요청 간격(2.2초)이 맡는다 — 옛 순위 batch의 키워드 사이 1.2–2.5초보다 길다.
 */
export async function readWingSearchKeyword<TRow extends { productId: string; itemId: string | null; vendorItemId: string | null }>(
  site: WingSearchKeywordSite<TRow>,
  keyword: string,
  maxPages: number,
  signal: AbortSignal,
): Promise<{ rows: TRow[]; pagesScanned: number } | null> {
  const rows = new Map<string, TRow>();
  let searchPage = 0;
  let pagesScanned = 0;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    if (signal.aborted) return null;
    const page = await site.searchPage(keyword, searchPage);
    pagesScanned += 1;
    for (const row of page.rows) {
      const key = `${row.productId}:${row.itemId ?? ''}:${row.vendorItemId ?? ''}`;
      if (!rows.has(key)) rows.set(key, row);
    }
    if (page.rows.length === 0 || page.nextSearchPage === null) break;
    if (page.nextSearchPage === searchPage) {
      if (pageIndex + 1 < maxPages) {
        throw new RuntimeError(ADVERTISING_COLLECTION_INCOMPLETE, `Wing 검색 '${keyword}'의 다음 쪽이 넘어가지 않았습니다. 다시 수집해 주세요.`, { keyword });
      }
      break;
    }
    searchPage = page.nextSearchPage;
  }
  return { rows: [...rows.values()], pagesScanned };
}

export function boundedInteger(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : null;
}

export function boundedNumber(value: number | null, minimum: number, maximum: number): number | null {
  return value !== null && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}
