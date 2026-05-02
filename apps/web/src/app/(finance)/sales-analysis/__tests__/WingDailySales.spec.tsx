import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WingDailySales from '../components/WingDailySales';
import { apiClient } from '@/lib/api-client';

function renderWithProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WingDailySales />
    </QueryClientProvider>,
  );
}

const dataSources = {
  generatedAt: '2026-05-02T00:00:00.000Z',
  wing: {
    firstDate: '2026-04-01',
    lastDate: '2026-04-30',
    dateCount: 30,
    lastSyncedAt: '2026-05-02T00:00:00.000Z',
  },
  ads: {
    firstDate: '2026-04-01',
    lastDate: '2026-04-30',
    dateCount: 30,
    lastSyncedAt: '2026-05-02T00:00:00.000Z',
    missingDates: [],
  },
  orders: {
    count: 0,
    firstDate: null,
    lastDate: null,
  },
};

describe('<WingDailySales>', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders mapped inventory rows and the multi-option exclusion note', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      year: 2026,
      month: 4,
      days: [
        {
          date: '2026-04-01',
          revenue: 120000,
          orders: 4,
          salesQty: 9,
          visitors: 80,
        },
      ],
      total: { revenue: 120000, orders: 4, salesQty: 9, visitors: 80 },
    });
    vi.spyOn(apiClient, 'getParsed').mockImplementation(async (path: string) => {
      if (path === '/api/sales-analysis/data-sources') {
        return dataSources as any;
      }
      if (path.startsWith('/api/sales-analysis/wing/mapped-inventory')) {
        return {
          year: 2026,
          month: 4,
          summary: {
            totalWingListings: 243,
            mappedListings: 235,
            skippedNoOption: 0,
            skippedMultiOption: 8,
            skippedMissingInventory: 0,
            totalRevenue: 120000,
            totalOrders: 4,
            totalSalesQty: 9,
            lowStockCount: 1,
            outOfStockCount: 0,
          },
          items: [
            {
              listingId: '11111111-1111-1111-1111-111111111111',
              externalId: 'SELLER-1',
              channelName: 'Wing 상품 A',
              masterId: '22222222-2222-2222-2222-222222222222',
              masterCode: 'MP-001',
              masterName: '마스터 상품 A',
              optionId: '33333333-3333-3333-3333-333333333333',
              sku: 'SKU-001',
              optionName: '기본',
              currentStock: 10,
              safetyStock: 2,
              monthRevenue: 120000,
              monthOrders: 4,
              monthSalesQty: 9,
              visitors: 80,
              projectedStock: 1,
              safetyGap: -1,
              stockStatus: 'low',
            },
          ],
          generatedAt: '2026-05-02T00:00:00.000Z',
        } as any;
      }
      throw new Error(`unexpected path: ${path}`);
    });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByText('Wing 상품 A')).toBeTruthy();
    });
    expect(screen.getByText('SKU-001')).toBeTruthy();
    expect(screen.getAllByText('안전재고 이하').length).toBeGreaterThan(0);
    expect(screen.getByText(/다옵션 등록상품 8개는/)).toBeTruthy();
  });
});
