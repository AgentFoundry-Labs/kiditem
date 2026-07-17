import { describe, expect, it, vi } from 'vitest';
import { ProductOperationsController } from './product-operations.controller';

describe('ProductOperationsController', () => {
  it('passes the authenticated organization to recipe component candidate search', async () => {
    const candidates = { search: vi.fn().mockResolvedValue({ items: [] }) };
    const controller = new ProductOperationsController(
      {} as never,
      {} as never,
      candidates as never,
    );

    await expect(controller.listRecipeComponentCandidates(
      '00000000-0000-4000-8000-000000000001',
      { search: 'SP-001', limit: 20 },
    )).resolves.toEqual({ items: [] });
    expect(candidates.search).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      { search: 'SP-001', limit: 20 },
    );
  });
});
