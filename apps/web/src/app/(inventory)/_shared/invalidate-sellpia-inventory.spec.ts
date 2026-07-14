import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { invalidateSellpiaInventory } from './invalidate-sellpia-inventory';

describe('invalidateSellpiaInventory', () => {
  it('refreshes every projection derived from a completed Sellpia snapshot', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    await invalidateSellpiaInventory({ invalidateQueries } as never);

    const keys = invalidateQueries.mock.calls.map(([argument]) => argument.queryKey);
    expect(keys).toEqual(expect.arrayContaining([
      queryKeys.inventory.snapshots(),
      queryKeys.inventory.assets(),
      queryKeys.inventory.importRuns(),
      queryKeys.channelSkuAvailability.all,
      queryKeys.channelSkuMappings.lists(),
      queryKeys.dashboard.inventory(),
      queryKeys.products.all,
      queryKeys.ads.all,
    ]));
  });
});
