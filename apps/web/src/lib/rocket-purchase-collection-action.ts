import type {
  RocketPurchasePreviewRequest,
  RocketPurchasePreviewResponse,
} from '@kiditem/shared/rocket-purchase-preview';
import {
  collectRocketPoRowsForConfirmationFromExtension,
  finalizeRocketPoCollectionSession,
} from '@/lib/rocket-sales-collection';
import { previewRocketPurchases } from '@/lib/rocket-purchase-preview-api';

export type CollectedRocketPurchaseOrders = Awaited<
  ReturnType<typeof collectRocketPoRowsForConfirmationFromExtension>
>;

type CollectAndPersistRocketPurchaseOrdersInput = {
  from: string;
  to: string;
  createPreviewRequest: (
    collected: CollectedRocketPurchaseOrders,
  ) => RocketPurchasePreviewRequest;
  onCollected?: (collected: CollectedRocketPurchaseOrders) => void;
  onCatalogSaved?: () => void;
  preview?: typeof previewRocketPurchases;
};

export type CollectAndPersistRocketPurchaseOrdersResult = {
  collected: CollectedRocketPurchaseOrders;
  initialPreview: RocketPurchasePreviewResponse;
  request: RocketPurchasePreviewRequest;
};

export class RocketPurchaseCollectionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RocketPurchaseCollectionValidationError';
  }
}

/**
 * Exact extension collection and durable catalog-save command shared by the
 * Rocket screen and dashboard. UI preview state is deliberately left to the
 * caller after this common side-effect boundary succeeds.
 */
export async function collectAndPersistRocketPurchaseOrders({
  from,
  to,
  createPreviewRequest,
  onCollected,
  onCatalogSaved,
  preview = previewRocketPurchases,
}: CollectAndPersistRocketPurchaseOrdersInput): Promise<
  CollectAndPersistRocketPurchaseOrdersResult
> {
  let collected: CollectedRocketPurchaseOrders | null = null;
  try {
    collected = await collectRocketPoRowsForConfirmationFromExtension({ from, to });
    onCollected?.(collected);
    const request = createPreviewRequest(collected);
    const initialPreview = await preview(request);
    if (initialPreview.catalog) onCatalogSaved?.();

    if (collected.poCount > 0 && initialPreview.catalog === null) {
      const incomplete = initialPreview.status === 'ready'
        && initialPreview.rows.some(({ reason }) => reason === 'collection_incomplete');
      throw new RocketPurchaseCollectionValidationError(incomplete
        ? `로켓 PO ${collected.poCount}건 중 ${collected.collection.detailPoCount}건만 수집되어 저장하지 않았습니다.`
        : `로켓 PO ${collected.poCount}건을 수집했지만 검증을 통과하지 못해 저장하지 않았습니다.`);
    }

    await finalizeRocketPoCollectionSession({
      ...(collected.extensionId ? { extensionId: collected.extensionId } : {}),
      runId: collected.collection.collectionRunId,
      status: 'succeeded',
      message: '로켓 PO 수집본 저장을 완료했습니다.',
    }).catch(() => undefined);
    return { collected, initialPreview, request };
  } catch (error) {
    if (collected) {
      await finalizeRocketPoCollectionSession({
        ...(collected.extensionId ? { extensionId: collected.extensionId } : {}),
        runId: collected.collection.collectionRunId,
        status: 'failed',
        message: error instanceof Error
          ? error.message
          : '로켓 PO 수집본을 서버에 저장하지 못했습니다.',
      }).catch(() => undefined);
    }
    throw error;
  }
}
