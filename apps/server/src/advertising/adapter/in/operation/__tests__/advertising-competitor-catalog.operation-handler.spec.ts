import { describe, expect, it, vi } from 'vitest';
import { AdvertisingCompetitorCatalogOperationHandler } from '../advertising-competitor-catalog.operation-handler';

describe('AdvertisingCompetitorCatalogOperationHandler', () => {
  it('registers only the retained competitor catalog browser operation', async () => {
    const registry = { register: vi.fn() };
    const handler = new AdvertisingCompetitorCatalogOperationHandler(registry as never);

    handler.onModuleInit();

    expect(registry.register).toHaveBeenCalledTimes(1);
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
