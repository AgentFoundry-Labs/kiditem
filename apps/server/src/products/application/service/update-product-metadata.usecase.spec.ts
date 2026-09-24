import { describe, expect, it, vi } from 'vitest';
import { UpdateProductMetadataUseCase } from './update-product-metadata.usecase';
import type { ProductOperationsRepositoryPort } from '../port/out/persistence/product-operations.repository.port';
import type { ProductQueryPort } from '../port/in/product-query.port';

function setup() {
  const updateProduct = vi.fn();
  const repository = { updateProduct } as unknown as ProductOperationsRepositoryPort;
  const products = { getProduct: vi.fn().mockResolvedValue({ id: 'product', imageUrls: ['https://example.test/a.png'] }) } as unknown as ProductQueryPort;
  return { usecase: new UpdateProductMetadataUseCase(repository, products), updateProduct };
}

describe('manual product metadata', () => {
  it.each(['code', 'name', 'currentStock', 'description', 'tags', 'category', 'brand', 'isActive', 'purchasePrice'])(
    'rejects %s rather than silently dropping a removed or source-owned field', async (field) => {
      const { usecase, updateProduct } = setup();
      await expect(usecase.updateProduct('org', 'product', { imageUrls: [], [field]: 'override' })).rejects.toThrow();
      expect(updateProduct).not.toHaveBeenCalled();
    },
  );
  it('accepts an explicit image replacement including clearing images', async () => {
    const { usecase, updateProduct } = setup();
    await usecase.updateProduct('org', 'product', { imageUrls: [] });
    expect(updateProduct).toHaveBeenCalledWith('org', 'product', { imageUrls: [] });
  });
});
