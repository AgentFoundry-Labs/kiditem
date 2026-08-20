import { describe, expect, it, vi } from 'vitest';
import { AdvertisingTrackedWingProductsOperationHandler } from '../advertising-tracked-wing-products.operation-handler';

describe('AdvertisingTrackedWingProductsOperationHandler', () => {
  it('registers the exact Ads browser definitions and waits for the extension runtime', async () => {
    const registry = { register: vi.fn() };
    const handler = new AdvertisingTrackedWingProductsOperationHandler(registry as never);

    handler.onModuleInit();

    expect(registry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'advertising.refresh_tracked_wing_products',
        resourceClass: 'extension_coupang',
      }),
      handler,
    );
    expect(registry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'advertising.collect_competitor_catalog',
        resourceClass: 'extension_coupang',
      }),
      handler,
    );
    await expect(handler.execute({} as never)).resolves.toEqual({ kind: 'waiting_runtime' });
  });
});
