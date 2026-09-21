import { describe, expect, it } from 'vitest';
import { buildProductDepletionProjections } from './sellpia-product-depletion-projection';

describe('buildProductDepletionProjections', () => {
  it('exposes the owner monthly average once for duplicated source rows', () => {
    const row = {
      needsReorder: true, monthsOfAvailableStockLeft: 0.4,
      monthlyOutflow: 25, outflowMonthCount: 2,
      inventoryResolution: { status: 'matched' as const, masterProductId: 'master-1',
        destinations: [{ masterProductId: 'master-1' }] },
    };
    const result = buildProductDepletionProjections(['master-1'], [row, row]);
    expect(result.get('master-1')).toMatchObject({ monthlyOutflow: 25, outflowMonthCount: 2 });
  });

  it('projects distinct matched SKUs to every destination without choosing a representative', () => {
    const result = buildProductDepletionProjections(
      ['master-1', 'master-2', 'master-3'],
      [{
        monthlyOutflow: 25, outflowMonthCount: 2,
        needsReorder: true,
        monthsOfAvailableStockLeft: 0.4,
        inventoryResolution: {
          status: 'matched',
          masterProductId: 'sku-1',
          destinations: [
            { masterProductId: 'master-1' },
            { masterProductId: 'master-2' },
          ],
        },
      }, {
        monthlyOutflow: 25, outflowMonthCount: 2,
        needsReorder: false,
        monthsOfAvailableStockLeft: 2,
        inventoryResolution: {
          status: 'matched',
          masterProductId: 'sku-1',
          destinations: [{ masterProductId: 'master-1' }],
        },
      }],
    );

    expect(result.get('master-1')).toEqual({
      coverage: 'shared',
      monthlyOutflow: 25, outflowMonthCount: 2,
      needsReorder: true,
      reorderSkuCount: 1,
      minMonthsOfAvailableStockLeft: 0.4,
    });
    expect(result.get('master-2')).toEqual(result.get('master-1'));
    expect(result.get('master-3')).toEqual({
      coverage: 'no_direct_sales',
      monthlyOutflow: null, outflowMonthCount: 0,
      needsReorder: false,
      reorderSkuCount: 0,
      minMonthsOfAvailableStockLeft: null,
    });
  });
});
