import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectAndPersistRocketPurchaseOrders,
  RocketPurchaseCollectionValidationError,
} from '@/lib/rocket-purchase-collection-action';
import { previewRocketPurchases } from '@/lib/rocket-purchase-preview-api';
import {
  collectRocketPoRowsForConfirmationFromExtension,
  finalizeRocketPoCollectionSession,
} from '@/lib/rocket-sales-collection';

vi.mock('@/lib/rocket-purchase-preview-api', () => ({
  previewRocketPurchases: vi.fn(),
}));

vi.mock('@/lib/rocket-sales-collection', () => ({
  collectRocketPoRowsForConfirmationFromExtension: vi.fn(),
  finalizeRocketPoCollectionSession: vi.fn(),
}));

const collected = {
  rows: [{ poNumber: 'PO-1' }],
  poCount: 1,
  collection: {
    collectionRunId: '11111111-1111-4111-8111-111111111111',
    detailPoCount: 1,
  },
  extensionId: 'extension-id',
} as Awaited<ReturnType<typeof collectRocketPoRowsForConfirmationFromExtension>>;

describe('collectAndPersistRocketPurchaseOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collectRocketPoRowsForConfirmationFromExtension)
      .mockResolvedValue(collected);
    vi.mocked(finalizeRocketPoCollectionSession).mockResolvedValue(undefined);
  });

  it('publishes the catalog and terminalizes the same extension session', async () => {
    const request = { channelAccountId: 'account-id' } as never;
    const preview = {
      status: 'ready',
      catalog: { sourceImportRunId: 'source-run' },
      rows: [],
    } as never;
    vi.mocked(previewRocketPurchases).mockResolvedValue(preview);
    const onCatalogSaved = vi.fn();

    await expect(collectAndPersistRocketPurchaseOrders({
      from: '2026-08-01',
      to: '2026-08-31',
      createPreviewRequest: () => request,
      onCatalogSaved,
    })).resolves.toEqual({
      collected,
      request,
      initialPreview: preview,
    });
    expect(onCatalogSaved).toHaveBeenCalledTimes(1);
    expect(finalizeRocketPoCollectionSession).toHaveBeenCalledWith({
      extensionId: 'extension-id',
      runId: collected.collection.collectionRunId,
      status: 'succeeded',
      message: '로켓 PO 수집본 저장을 완료했습니다.',
    });
  });

  it('does not label an incomplete nonempty collection as saved', async () => {
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      status: 'ready',
      catalog: null,
      rows: [{ reason: 'collection_incomplete' }],
    } as never);

    const result = collectAndPersistRocketPurchaseOrders({
      from: '2026-08-01',
      to: '2026-08-31',
      createPreviewRequest: () => ({} as never),
    });
    await expect(result).rejects.toBeInstanceOf(
      RocketPurchaseCollectionValidationError,
    );
    expect(finalizeRocketPoCollectionSession).toHaveBeenLastCalledWith({
      extensionId: 'extension-id',
      runId: collected.collection.collectionRunId,
      status: 'failed',
      message: '로켓 PO 1건 중 1건만 수집되어 저장하지 않았습니다.',
    });
  });
});
