import { describe, expect, it, vi } from 'vitest';
import { SellpiaProductSalesController } from './sellpia-product-sales.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

describe('SellpiaProductSalesController', () => {
  it('reads the depletion summary for the authenticated organization and requested months', async () => {
    const summary = { products: [] };
    const service = { getSummary: vi.fn().mockResolvedValue(summary) };
    const controller = new SellpiaProductSalesController(service as never);

    await expect(controller.getSummary({ months: 6 }, ORGANIZATION_ID)).resolves.toBe(summary);
    expect(service.getSummary).toHaveBeenCalledWith(ORGANIZATION_ID, 6);
  });

  it('exposes no collection route — collection is the analytics.sellpia_product_profitability operation', () => {
    const methods = Object.getOwnPropertyNames(SellpiaProductSalesController.prototype).filter((name) => name !== 'constructor');
    expect(methods).toEqual(['getSummary']);
  });
});
