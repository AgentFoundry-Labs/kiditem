import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Statistics from '../components/Statistics';
import { apiClient } from '@/lib/api-client';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('period=2026-04'),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/sales-analysis',
}));

function renderWithProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Statistics />
    </QueryClientProvider>,
  );
}

describe('<Statistics> (Plan B1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading skeleton on pending query', () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation(() => new Promise(() => {}));
    renderWithProvider();
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders error state on failed query', async () => {
    vi.spyOn(apiClient, 'getParsed').mockRejectedValue(new Error('502 Bad Gateway'));
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByText(/502 Bad Gateway/)).toBeTruthy();
    });
  });

  it('renders product rows after switching tabs', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.includes('type=overview')) {
        return Promise.resolve({
          totalRevenue: 0,
          totalOrders: 0,
          totalProfit: 0,
          avgMargin: 0,
          totalProducts: 0,
        });
      }

      if (path.includes('type=products')) {
        return Promise.resolve([
          {
            listingId: '11111111-1111-1111-1111-111111111111',
            externalId: 'EXT-1',
            channelName: '쿠팡 상품',
            masterId: '22222222-2222-2222-2222-222222222222',
            masterCode: 'M-001',
            productName: 'Master A',
            category: '유아용품',
            grade: 'A',
            thumbnailUrl: null,
            totalRevenue: 100000,
            netProfit: 20000,
            orderCount: 3,
            profitRate: 0.2,
            margin: 0.2,
          },
        ]);
      }

      throw new Error(`unexpected path: ${path}`);
    });

    renderWithProvider();
    await userEvent.click(screen.getByRole('button', { name: /제품별/ }));

    await waitFor(() => {
      expect(screen.getByText('Master A')).toBeTruthy();
    });
    expect(screen.getByText(/20.0%/)).toBeTruthy();
  });

  it('renders repurchase lastOrder ISO strings without crashing', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.includes('type=overview')) {
        return Promise.resolve({
          totalRevenue: 0,
          totalOrders: 0,
          totalProfit: 0,
          avgMargin: 0,
          totalProducts: 0,
        });
      }

      if (path.includes('type=repurchase')) {
        return Promise.resolve({
          totalCustomers: 2,
          repeatCount: 1,
          repurchaseRate: 0.5,
          totalOrders: 3,
          repeatProducts: [
            {
              masterId: '33333333-3333-3333-3333-333333333333',
              productName: 'Master Repeat',
              category: '유아용품',
              orderCount: 2,
            },
          ],
          repeatCustomers: [
            {
              name: '홍길동',
              count: 2,
              totalAmount: 30000,
              lastOrder: '2026-04-15T00:00:00.000Z',
            },
          ],
        });
      }

      throw new Error(`unexpected path: ${path}`);
    });

    renderWithProvider();
    await userEvent.click(screen.getByRole('button', { name: /재구매율/ }));

    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeTruthy();
    });
    expect(screen.getByText('2026. 04. 15.')).toBeTruthy();
  });
});
