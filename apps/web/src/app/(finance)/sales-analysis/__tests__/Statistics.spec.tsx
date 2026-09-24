import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPeriodBasis } from '@kiditem/shared/dashboard';
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

const aprilBasis = (days: number) => buildPeriodBasis({
  from: '2026-04-01',
  to: '2026-04-30',
  includedDates: Array.from({ length: days }, (_, index) => `2026-04-${String(index + 1).padStart(2, '0')}`),
  sources: ['orders'],
});
const windowBasis = (days = 30) => ({ revenue: aprilBasis(days), adCost: aprilBasis(30), profit: aprilBasis(days) });

const measuredOverview = {
  totalRevenue: 0,
  totalOrders: 0,
  totalProfit: 0,
  avgMargin: null,
  totalProducts: 0,
  basis: windowBasis(),
};

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
      expect(screen.getByText(/처리 중 문제가 생겼습니다/)).toBeTruthy();
    });
  });

  it("renders unmeasured overview totals as '-' with the order coverage behind them", async () => {
    vi.spyOn(apiClient, 'getParsed').mockResolvedValue({
      totalRevenue: null,
      totalOrders: null,
      totalProfit: null,
      avgMargin: null,
      totalProducts: 2,
      basis: windowBasis(14),
    });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByText(/주문 수집 14\/30일/)).toBeTruthy();
    });
    for (const label of ['총 매출', '전체 주문', '총 이익', '평균 마진']) {
      expect(screen.getByText(label).nextElementSibling?.textContent, label).toBe('-');
    }
  });

  it('renders product rows after switching tabs', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.includes('type=overview')) {
        return Promise.resolve(measuredOverview);
      }

      if (path.includes('type=products')) {
        return Promise.resolve({
          rows: [
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
          ],
          basis: windowBasis(),
        });
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

  it('renders repurchase lastOrder ISO strings and an unavailable rate without crashing', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.includes('type=overview')) {
        return Promise.resolve(measuredOverview);
      }

      if (path.includes('type=repurchase')) {
        return Promise.resolve({
          totalCustomers: 2,
          repeatCount: 1,
          repurchaseRate: null,
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
          basis: { orders: aprilBasis(30) },
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
    const rateLabel = screen.getAllByText('재구매율').find((element) => element.classList.contains('card-label'));
    expect(rateLabel?.nextElementSibling?.textContent).toBe('-');
  });
});
