import { describe, expect, it } from 'vitest';
import { buildProductDepletionProjections } from './sellpia-product-depletion-projection';

describe('buildProductDepletionProjections', () => {
  it('projects distinct matched SKUs to every destination without choosing a representative', () => {
    const result = buildProductDepletionProjections(
      ['master-1', 'master-2', 'master-3'],
      [{
        needsReorder: true,
        monthsOfAvailableStockLeft: 0.4,
        inventoryResolution: {
          status: 'matched',
          sellpiaInventorySkuId: 'sku-1',
          destinations: [
            { masterProductId: 'master-1' },
            { masterProductId: 'master-2' },
          ],
        },
      }, {
        needsReorder: false,
        monthsOfAvailableStockLeft: 2,
        inventoryResolution: {
          status: 'matched',
          sellpiaInventorySkuId: 'sku-1',
          destinations: [{ masterProductId: 'master-1' }],
        },
      }],
    );

    expect(result.get('master-1')).toEqual({
      coverage: 'shared',
      needsReorder: true,
      reorderSkuCount: 1,
      minMonthsOfAvailableStockLeft: 0.4,
    });
    expect(result.get('master-2')).toEqual(result.get('master-1'));
    expect(result.get('master-3')).toEqual({
      coverage: 'no_direct_sales',
      needsReorder: false,
      reorderSkuCount: 0,
      minMonthsOfAvailableStockLeft: null,
    });
  });
});
