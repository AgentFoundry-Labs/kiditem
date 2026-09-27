export const STOCKOUT_CHECK_PORT = Symbol('STOCKOUT_CHECK_PORT');
export type StockoutCheckDecision =
  | 'eligible'
  | 'in_stock'
  | 'unknown'
  | 'unsupported'
  | 'already_sold_out'
  | 'active_execution'
  /** 판매가를 아직 정하지 않은 초안. 등록 동결 · 몰 엑셀과 같은 게이트다(KID-310). */
  | 'draft';
export interface StockoutCheckResult {
  listingId: string;
  channelAccountId: string;
  externalListingId: string;
  channel: string;
  decision: StockoutCheckDecision;
  optionCodes: string[];
}
export interface StockoutCheckPort {
  preview(
    organizationId: string,
    listingIds: readonly string[],
  ): Promise<StockoutCheckResult[]>;
}
