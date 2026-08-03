import { describe, expect, it, vi } from 'vitest';
import { ProductOperationsController } from './product-operations.controller';

describe('ProductOperationsController', () => {
  it('passes the authenticated organization to recipe component candidate search', async () => {
    const candidates = { search: vi.fn().mockResolvedValue({ items: [] }) };
    const controller = new ProductOperationsController(
      {} as never,
      candidates as never,
      {} as never,
    );

    await expect(controller.listRecipeComponentCandidates(
      '00000000-0000-4000-8000-000000000001',
      { search: 'SP-001', limit: 20, stockStatus: 'in_stock' },
    )).resolves.toEqual({ items: [] });
    expect(candidates.search).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      { search: 'SP-001', limit: 20, stockStatus: 'in_stock' },
    );
  });

  it('forwards a direct channel-option inventory replacement', async () => {
    const products = {
      replaceChannelOptionInventory: vi.fn().mockResolvedValue({ id: 'product-1' }),
    };
    const controller = new ProductOperationsController(
      products as never,
      {} as never,
      {} as never,
    );
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const optionId = '00000000-0000-4000-8000-000000000003';
    const body = { components: [] };

    await expect(controller.replaceChannelOptionInventory(
      organizationId,
      optionId,
      body,
    )).resolves.toEqual({ id: 'product-1' });
    expect(products.replaceChannelOptionInventory).toHaveBeenCalledWith(
      organizationId,
      optionId,
      body,
    );
  });
});
