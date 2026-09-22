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
  | 'active_execution';
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
