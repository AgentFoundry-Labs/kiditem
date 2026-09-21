import { describe, expect, it, vi } from 'vitest';
import { ProductOperationsController } from './product-operations.controller';

describe('ProductOperationsController', () => {
  it('forwards organization-scoped product reads and writes to Products ports', async () => {
    const products = {
      listProducts: vi.fn().mockResolvedValue({ items: [] }),
      getProduct: vi.fn().mockResolvedValue({ id: 'product-1' }),
    };
    const metadata = { updateProduct: vi.fn().mockResolvedValue({ id: 'product-1' }) };
    const sourceCorrection = {
      correctSourceBinding: vi.fn().mockResolvedValue({ id: 'product-1' }),
    };
    const dataStatus = { getStatus: vi.fn().mockResolvedValue({}) };
    const controller = new ProductOperationsController(
      products as never,
      metadata as never,
      sourceCorrection as never,
      dataStatus as never,
    );
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const productId = '00000000-0000-4000-8000-000000000002';

    await controller.listProducts(organizationId, {} as never);
    await controller.getDataStatus(organizationId, { periodDays: 30 });
    await controller.getProduct(organizationId, productId);
    await controller.updateProduct(organizationId, productId, { imageUrls: ['https://example.test/product.jpg'] });
    await controller.correctSourceBinding(organizationId, productId, { sourceProductCode: 'SP-1', sourceOptionCode: '' });

    expect(products.listProducts).toHaveBeenCalledWith(organizationId, {});
    expect(dataStatus.getStatus).toHaveBeenCalledWith(organizationId, 30);
    expect(products.getProduct).toHaveBeenCalledWith(organizationId, productId);
    expect(metadata.updateProduct).toHaveBeenCalledWith(
      organizationId,
      productId,
      { imageUrls: ['https://example.test/product.jpg'] },
    );
    expect(sourceCorrection.correctSourceBinding).toHaveBeenCalledWith(
      organizationId,
      productId,
      { sourceProductCode: 'SP-1', sourceOptionCode: '' },
    );
  });
});
