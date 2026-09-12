import { collectRocketPoRowsForConfirmationFromExtension } from '@/lib/rocket-sales-collection';
import { previewRocketPurchases } from '@/lib/rocket-purchase-preview-api';
import type {
  RocketPurchasePreviewRequest,
  RocketPurchasePreviewResponse,
} from '@kiditem/shared/rocket-purchase-preview';

export type CollectedRocketPurchaseOrders = Awaited<ReturnType<typeof collectRocketPoRowsForConfirmationFromExtension>>;
export type CollectAndPersistRocketPurchaseOrdersInput =
  Parameters<typeof collectRocketPoRowsForConfirmationFromExtension>[0] & {
    createPreviewRequest: (collected: CollectedRocketPurchaseOrders) => RocketPurchasePreviewRequest;
    onCatalogSaved?: () => void;
  };
export type CollectAndPersistRocketPurchaseOrdersResult = {
  collected: CollectedRocketPurchaseOrders;
  initialPreview: RocketPurchasePreviewResponse;
  request: RocketPurchasePreviewRequest;
};

/** Collection is already owner-COMPLETE before the caller's explicit preview.
 * Preview errors never fail or finalize the source from the page. */
export async function collectAndPersistRocketPurchaseOrders({
  createPreviewRequest, onCatalogSaved, ...input
}: CollectAndPersistRocketPurchaseOrdersInput): Promise<CollectAndPersistRocketPurchaseOrdersResult> {
  const collected = await collectRocketPoRowsForConfirmationFromExtension(input);
  onCatalogSaved?.();
  const request = createPreviewRequest(collected);
  const initialPreview = await previewRocketPurchases(request);
  return { collected, request, initialPreview };
}
