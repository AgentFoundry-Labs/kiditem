/**
 * Advertising이 다른 owner에게 공개하는 키워드 순위 읽기(KID-362). 판매순위 행은 `advertising.wing_rank` 실행의
 * finish 트랜잭션에서만 쓰이므로(ADR-0025) 성공한 실행이 발행한 행만 본다. 옛 attempt 행은 보지 않는다.
 */
export const ADVERTISING_KEYWORD_RANK_READ_PORT = Symbol('ADVERTISING_KEYWORD_RANK_READ_PORT');

export type WingRankCoverage = Readonly<{
  /** 이 상품들의 가장 최근 판매순위 업무일(KST). 없으면 null. */
  businessDate: Date | null;
  capturedAt: Date | null;
  /** 그 업무일에 판매순위 행이 있는 상품. */
  vendorItemIds: readonly string[];
  rowCount: number;
}>;

export interface AdvertisingKeywordRankReadPort {
  /** 주어진 자사 옵션(vendorItemId)들의 최신 Wing 판매순위 수집 범위. 판매순위 행에는 계정이 없어 호출자가 상품으로 가른다. */
  readWingRankCoverage(organizationId: string, vendorItemIds: readonly string[]): Promise<WingRankCoverage>;
}
