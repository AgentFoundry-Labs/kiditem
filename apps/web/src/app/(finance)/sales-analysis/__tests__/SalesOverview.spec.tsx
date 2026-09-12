import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api-client';
import SalesOverview from '../components/SalesOverview';

const state = vi.hoisted(() => ({
  search: '',
  knownThrough: '2026-07-25' as string | null,
  readChannelSales: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/sales-analysis',
}));

vi.mock('@/hooks/useSellpiaChannelSales', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/useSellpiaChannelSales')>(),
  useSellpiaKnownThrough: () => state.knownThrough,
  useSellpiaChannelSales: (range: { from: string; to: string } | null) => {
    state.readChannelSales(range);
    return {
      summary: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      sync: vi.fn(),
      syncing: false,
    };
  },
}));

function renderWithProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SalesOverview />
    </QueryClientProvider>,
  );
}

function mockSalesQuery(response: unknown) {
  vi.spyOn(apiClient, 'getParsed').mockImplementation(async () => {
    return response as any;
  });
}

describe('<SalesOverview> 3-state (Plan D.3)', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'getParsed').mockReset();
    state.search = '';
    state.knownThrough = '2026-07-25';
    state.readChannelSales.mockClear();
  });

  it('defaults to August on September 1 and offers the September anchor month', async () => {
    state.knownThrough = '2026-08-31';
    mockSalesQuery({ channels: [] });
    renderWithProvider();
    await waitFor(() => expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/sales-analysis?period=2026-08', expect.anything(),
    ));
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('2026-08');
    expect(screen.getByRole('option', { name: '2026년 9월' })).toBeTruthy();
    expect(state.readChannelSales).toHaveBeenLastCalledWith({
      from: '2026-08-01', to: '2026-08-31',
    });
  });

  it('keeps the dashboard September link free of future Sellpia queries on September 1', () => {
    state.knownThrough = '2026-08-31';
    state.search = 'tab=overview&period=2026-09&channel=rocket';
    mockSalesQuery({ channels: [] });
    renderWithProvider();
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('2026-09');
    expect(state.readChannelSales).toHaveBeenLastCalledWith(null);
  });

  it('renders loading skeleton on pending query', () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation(() => new Promise(() => {}));
    renderWithProvider();
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders empty state when no channels', async () => {
    mockSalesQuery({
      period: '2026-04',
      channels: [],
      totals: { totalRevenue: 0, totalProfit: 0, totalOrders: 0, totalCost: 0, orphanReturnCount: 0 },
    });
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/해당 기간 주문 기반 매출 데이터가 없습니다/)).toBeTruthy();
    });
  });

  it('renders error on 502 rejection', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation(async () => {
      throw new Error('502 Bad Gateway');
    });
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/502/)).toBeTruthy();
    });
  });

  it('renders ZodError as user-friendly message', async () => {
    const { ZodError } = await import('zod');
    const zErr = new ZodError([{
      code: 'invalid_type', expected: 'string', received: 'number',
      path: ['period'], message: 'bad',
    } as any]);
    vi.spyOn(apiClient, 'getParsed').mockImplementation(async () => {
      throw zErr;
    });
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/응답 형식 오류/)).toBeTruthy();
    });
  });

  it('renders channel rows + orphan badge on successful data', async () => {
    mockSalesQuery({
      period: '2026-04',
      channels: [
        {
          channel: 'coupang',
          channelType: 'marketplace',
          totalOrders: 10,
          totalRevenue: 100000,
          totalCost: 50000,
          totalProfit: 50000,
          returnCount: 1,
          returnRate: 0.1,
          avgOrderValue: 10000,
        },
        {
          channel: 'naver',
          channelType: 'marketplace',
          totalOrders: 5,
          totalRevenue: 40000,
          totalCost: 25000,
          totalProfit: 15000,
          returnCount: 0,
          returnRate: 0,
          avgOrderValue: 8000,
        },
      ],
      totals: {
        totalRevenue: 140000,
        totalProfit: 65000,
        totalOrders: 15,
        totalCost: 75000,
        orphanReturnCount: 3,
      },
    });
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/coupang/)).toBeTruthy();
    });
    expect(screen.getByText(/naver/)).toBeTruthy();
    // orphan badge visible (count > 0)
    expect(screen.getByText(/주문 연결 없는 반품/)).toBeTruthy();
    // orphanReturnCount=3 renders as "3" inside <strong>, then "건" sibling text
    expect(screen.getByText('3')).toBeTruthy();
  });
});
