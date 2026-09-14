import type {
  RocketPurchasePreviewFreshnessPendingResponse,
  RocketPurchasePreviewReadyResponse,
  RocketPurchasePreviewResponse,
} from '@kiditem/shared/rocket-purchase-preview';

export const ROCKET_INVENTORY_COLLECTION_REQUIRED = '재고 수집이 필요합니다.';

/** A preview that needs a fresher Sellpia generation than the latest complete one. */
export class RocketInventoryCollectionRequiredError extends Error {
  readonly name = 'RocketInventoryCollectionRequiredError';

  constructor(readonly checkpoint: RocketPurchasePreviewFreshnessPendingResponse) {
    super(ROCKET_INVENTORY_COLLECTION_REQUIRED);
  }
}

/**
 * A freshness-pending preview publishes its advisory rows and stops. The page
 * never starts a Sellpia inventory collection or re-requests the preview by
 * itself; the operator collects inventory and recalculates.
 */
export async function requireFreshRocketPreview(
  initial: RocketPurchasePreviewResponse,
  publishPending: (
    checkpoint: RocketPurchasePreviewFreshnessPendingResponse,
  ) => void | Promise<void>,
): Promise<RocketPurchasePreviewReadyResponse> {
  if (initial.status === 'ready') return initial;
  await publishPending(initial);
  throw new RocketInventoryCollectionRequiredError(initial);
}
