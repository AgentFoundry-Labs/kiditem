import { describe, expect, it, vi } from 'vitest';
import type { SellpiaInventorySnapshotVerifiedEvent } from '../../../../inventory/application/event/sellpia-inventory.events';
import { MasterProductInventoryActivityListener } from './master-product-inventory-activity.listener';

describe('MasterProductInventoryActivityListener', () => {
  it('reconciles operating-product activity after a verified Sellpia snapshot', async () => {
    const products = {
      reconcileInventoryActivity: vi.fn().mockResolvedValue({
        deactivatedMasterProductIds: ['product-1'],
        reactivatedMasterProductIds: ['product-2'],
      }),
    };
    const listener = new MasterProductInventoryActivityListener(products as never);
    const event: SellpiaInventorySnapshotVerifiedEvent = {
      organizationId: '00000000-0000-4000-8000-000000000001',
      runId: '00000000-0000-4000-8000-000000000002',
      generation: '7',
    };

    await listener.onSellpiaInventorySnapshotVerified(event);

    expect(products.reconcileInventoryActivity).toHaveBeenCalledWith(
      event.organizationId,
    );
  });
});
