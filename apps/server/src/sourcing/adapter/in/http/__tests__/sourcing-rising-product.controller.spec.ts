import { describe, expect, it, vi } from 'vitest';
import { SourcingRisingProductController } from '../sourcing-rising-product.controller';

describe('SourcingRisingProductController', () => {
  it('keeps GET latest as a pure persisted read', async () => {
    const rising = {
      getLatest: vi.fn().mockResolvedValue(null),
    };
    const controller = new SourcingRisingProductController(rising as never);

    await expect(controller.latest('org-1')).resolves.toBeNull();
    expect(rising.getLatest).toHaveBeenCalledWith('org-1');
  });
});
