import { describe, expect, it } from 'vitest';
import {
  SupplierProductSalesReportSchema,
  SupplierSalesReportSchema,
} from './supplier-stats.js';

const masterId = '00000000-0000-4000-8000-000000000001';
const supplierId = '00000000-0000-4000-8000-000000000002';

describe('supplier stats contracts', () => {
  it('reports cost-weighted revenue separately from unallocated revenue', () => {
    expect(SupplierSalesReportSchema.parse({
      summary: {
        supplierCount: 1,
        productCount: 1,
        totalOrders: 2,
        totalQuantity: 8,
        totalRevenue: 9_000,
        unallocatedRevenue: 1_000,
      },
      items: [{
        supplierId,
        supplierName: 'Supplier',
        productCount: 1,
        totalOrders: 2,
        totalQuantity: 8,
        totalRevenue: 9_000,
      }],
    }).summary.unallocatedRevenue).toBe(1_000);
  });

  it('uses the Sellpia physical Master as the product-sales identity', () => {
    const report = SupplierProductSalesReportSchema.parse({
      summary: {
        productCount: 1,
        totalOrders: 1,
        totalQuantity: 8,
        totalRevenue: 12_000,
      },
      items: [{
        masterId,
        masterCode: 'SP-001',
        masterName: '우파루팡반짝슈가말랑이',
        optionName: null,
        supplyPrice: 1_000,
        minOrderQty: 1,
        totalOrders: 1,
        totalQuantity: 8,
        totalRevenue: 12_000,
      }],
    });

    expect(report.items[0]).not.toHaveProperty('optionId');
    expect(report.items[0].masterId).toBe(masterId);
  });
});
