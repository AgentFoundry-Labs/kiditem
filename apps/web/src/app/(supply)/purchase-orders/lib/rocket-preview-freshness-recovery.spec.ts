import { describe, expect, it, vi } from 'vitest';
import type {
  RocketPurchasePreviewFreshnessPendingResponse,
  RocketPurchasePreviewReadyResponse,
} from '@kiditem/shared/rocket-purchase-preview';
import {
  requireFreshRocketPreview,
  RocketInventoryCollectionRequiredError,
} from './rocket-preview-freshness-recovery';

const pending = {
  status: 'freshness_pending',
  collectionRunId: '11111111-1111-4111-8111-111111111111',
  catalog: { run: { id: 'saved-run-1' } },
  requestedGeneration: '8',
  rows: [],
} as RocketPurchasePreviewFreshnessPendingResponse;

const ready = {
  status: 'ready',
  collectionRunId: pending.collectionRunId,
  catalog: pending.catalog,
  inventoryGeneration: '8',
  rows: [],
} as RocketPurchasePreviewReadyResponse;

describe('requireFreshRocketPreview', () => {
  it('passes a ready preview through without publishing advisory rows', async () => {
    const publishPending = vi.fn();

    await expect(requireFreshRocketPreview(ready, publishPending)).resolves.toBe(ready);

    expect(publishPending).not.toHaveBeenCalled();
  });

  it('publishes the advisory rows and asks for inventory collection instead of waiting or retrying', async () => {
    const publishPending = vi.fn();

    const outcome = requireFreshRocketPreview(pending, publishPending);

    await expect(outcome).rejects.toBeInstanceOf(RocketInventoryCollectionRequiredError);
    await expect(outcome).rejects.toMatchObject({
      message: '재고 수집이 필요합니다.',
      checkpoint: pending,
    });
    expect(publishPending).toHaveBeenCalledOnce();
    expect(publishPending).toHaveBeenCalledWith(pending);
  });
});
