import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSupplierProductSalesReport,
  fetchSupplierSalesReport,
} from '../lib/supplier-stats-api';
import SupplierSales from './SupplierSales';

vi.mock('../lib/supplier-stats-api', () => ({
  fetchSupplierSalesReport: vi.fn(),
  fetchSupplierProductSalesReport: vi.fn(),
}));

const supplierId = '00000000-0000-4000-8000-000000000002';

describe('SupplierSales', () => {
  beforeEach(() => {
    vi.mocked(fetchSupplierSalesReport).mockResolvedValue({
      summary: {
        supplierCount: 1,
        productCount: 1,
        totalOrders: 2,
        totalQuantity: 8,
        totalRevenue: 9_000,
        unallocatedRevenue: 0,
      },
      items: [{
        supplierId,
        supplierName: '보넷 공급사',
        productCount: 1,
        totalOrders: 2,
        totalQuantity: 8,
        totalRevenue: 9_000,
      }],
    });
    vi.mocked(fetchSupplierProductSalesReport).mockResolvedValue({
      summary: {
        productCount: 0,
        totalOrders: 0,
        totalQuantity: 0,
        totalRevenue: 0,
      },
      items: [],
    });
  });

  it('links each supplier row to its canonical filtered purchase orders', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SupplierSales />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('link', { name: '보넷 공급사 발주 보기' }))
      .toHaveAttribute('href', `/purchase-orders?supplierId=${supplierId}`);
  });
});
