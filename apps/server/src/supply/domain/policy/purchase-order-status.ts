/**
 * Purchase order lifecycle: draft → pending → ordered → shipped → received.
 * `cancelled` is a terminal-only counter currently exposed by listings; the
 * forward state machine does not transition into it (cancellation paths live
 * outside this contract for now).
 */
export type PurchaseOrderStatus =
  | 'draft'
  | 'pending'
  | 'ordered'
  | 'shipped'
  | 'received'
  | 'cancelled';

const VALID_TRANSITIONS: Readonly<Record<string, PurchaseOrderStatus>> = Object.freeze({
  draft: 'pending',
  pending: 'ordered',
  ordered: 'shipped',
  shipped: 'received',
});

export function isValidPurchaseOrderTransition(from: string, to: string): boolean {
  const expected = VALID_TRANSITIONS[from];
  return expected !== undefined && expected === to;
}

export function assertValidPurchaseOrderTransition(from: string, to: string): void {
  if (!isValidPurchaseOrderTransition(from, to)) {
    throw new Error(`Invalid purchase order transition: ${from} → ${to}`);
  }
}

export function isDeletablePurchaseOrderStatus(status: string): boolean {
  return status === 'draft' || status === 'pending';
}
