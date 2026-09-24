import type {
  ListingAvailabilityExecution,
  ListingAvailabilitySnapshot,
} from '@kiditem/shared/sales-product';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';

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
  prepare(
    organizationId: string,
    userId: string | null,
    input: { listingId: string; idempotencyKey: string },
  ): Promise<ListingAvailabilityExecution>;
  /** Re-evaluate under the execution owner's transaction immediately before claiming provider IO. */
  assertEligible(
    transaction: OwnerTransaction,
    organizationId: string,
    snapshot: ListingAvailabilitySnapshot,
    executionId: string,
  ): Promise<void>;
}
