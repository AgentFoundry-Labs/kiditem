import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPeriodBasis } from '@kiditem/shared/dashboard';
import ProfitLossPage from '../page';
import { apiClient } from '@/lib/api-client';

// next/navigation mock — the page uses useSearchParams/useRouter/usePathname
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/profit-loss',
}));

function renderWithProvider() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProfitLossPage />
    </QueryClientProvider>,
  );
}

const dataSources = {
  generatedAt: '2026-05-02T00:00:00.000Z',
  wing: {
    firstDate: '2026-04-18',
    lastDate: '2026-05-02',
    dateCount: 14,
    rowCount: 14,
    lastSyncedAt: '2026-05-02T00:00:00.000Z',
  },
  ads: {
    firstDate: '2026-04-19',
    lastDate: '2026-05-01',
    dateCount: 13,
    rowCount: 13,
    lastSyncedAt: '2026-05-01T00:00:00.000Z',
    missingDates: ['2026-04-18', '2026-05-02'],
  },
  orders: {
    firstDate: null,
    lastDate: null,
    count: 0,
  },
};

const aprilDates = (count: number) =>
  Array.from({ length: count }, (_, index) => `2026-04-${String(index + 1).padStart(2, '0')}`);
const basisOver = (days: number, sources: string[] = ['orders']) => buildPeriodBasis({
  from: '2026-04-01',
  to: '2026-04-30',
  includedDates: aprilDates(days),
  sources,
});
const completeBasis = {
  revenue: basisOver(30),
  adCost: basisOver(30, ['coupang_ads']),
  profit: basisOver(30, ['orders', 'coupang_ads']),
};
const unavailableTotals = {
  revenue: null, orderCount: null, cost: null, adCost: null, netProfit: null, profitRate: null,
};

function mockProfitLossQuery(response: unknown) {
  vi.spyOn(apiClient, 'getParsed').mockImplementation(async (url: string) => {
    if (url === '/api/sales-analysis/data-sources') return dataSources as any;
    return response as any;
  });
}

function cardValue(label: string): string | null | undefined {
  return screen.getByText(label).nextElementSibling?.textContent;
}

describe('<ProfitLossPage> 3-state', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'getParsed').mockReset();
    // syncInfo query uses apiClient.get — stub to avoid unrelated noise
    vi.spyOn(apiClient, 'get').mockResolvedValue({ lastSyncedAt: null });
  });

  it('renders skeleton on loading', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation(() => new Promise(() => {})); // never resolves
    renderWithProvider();
    const skeletonMarker = document.querySelector('.animate-pulse');
    expect(skeletonMarker).toBeTruthy();
  });

  it('renders empty state when the month has no rows', async () => {
    mockProfitLossQuery({
      period: '2026-04',
      rows: [],
      totals: { ...unavailableTotals, revenue: 0, orderCount: 0, cost: 0, adCost: 0, netProfit: 0 },
      basis: completeBasis,
    });
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/해당 기간 데이터가 없습니다/)).toBeTruthy();
    });
  });

  it("shows the server's month totals and '-' for every value that is not a measurement", async () => {
    mockProfitLossQuery({
      period: '2026-04',
      rows: [{
        listingId: '11111111-1111-4111-8111-111111111111',
        externalId: 'EXT-1',
        channelName: '쿠팡',
        masterId: '22222222-2222-4222-8222-222222222222',
        masterCode: 'M-1',
        masterName: '원가 미상 상품',
        category: null,
        grade: 'A',
        thumbnailUrl: null,
        revenue: 20_000,
        cogs: null,
        commission: 2_000,
        shippingCost: 0,
        adCost: 0,
        otherCost: 0,
        netProfit: null,
        profitRate: null,
        orderCount: 1,
        returnCount: 0,
      }],
      totals: { ...unavailableTotals, adCost: 0 },
      basis: { ...completeBasis, revenue: basisOver(20) },
    });
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByText('원가 미상 상품')).toBeTruthy();
    });
    expect(cardValue('총 매출')).toBe('-');
    expect(cardValue('총 순이익')).toBe('-');
    expect(cardValue('평균 이익률')).toBe('-');
    expect(screen.getByText(/주문 수집 20\/30일/)).toBeTruthy();
  });

  it('names the closed days an in-progress month was evaluated over', async () => {
    const closedDays = basisOver(14);
    mockProfitLossQuery({
      period: '2026-04',
      rows: [],
      totals: { revenue: 0, orderCount: 0, cost: 0, adCost: 0, netProfit: 0, profitRate: null },
      basis: {
        requestedWindow: { from: '2026-04-01', to: '2026-04-30' },
        revenue: buildPeriodBasis({ from: '2026-04-01', to: '2026-04-14', includedDates: closedDays.includedDates, sources: ['orders'] }),
        adCost: buildPeriodBasis({ from: '2026-04-01', to: '2026-04-14', includedDates: closedDays.includedDates, sources: ['coupang_ads'] }),
        profit: buildPeriodBasis({ from: '2026-04-01', to: '2026-04-14', includedDates: closedDays.includedDates, sources: ['orders'] }),
      },
    });
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByText(/2026-04-01 ~ 2026-04-14 마감일 기준/)).toBeTruthy();
    });
    // No per-day coverage count: every closed day was collected.
    expect(screen.queryByText(/주문 수집 \d+\/\d+일/)).toBeNull();
  });

  it('says no day has closed yet on the 1st instead of counting an empty window', async () => {
    const noClosedDay = buildPeriodBasis({ from: '2026-04-01', to: '2026-03-31', sources: ['orders'] });
    mockProfitLossQuery({
      period: '2026-04',
      rows: [],
      totals: unavailableTotals,
      basis: {
        requestedWindow: { from: '2026-04-01', to: '2026-04-30' },
        revenue: noClosedDay,
        adCost: noClosedDay,
        profit: noClosedDay,
      },
    });
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByText(/아직 마감된 날이 없습니다/)).toBeTruthy();
    });
    expect(screen.queryByText(/주문 수집 0\/0일/)).toBeNull();
    expect(cardValue('총 매출')).toBe('-');
  });

  /** KID-85 follow-up F-6 — the count is completed collections only, not the database. */
  it('says no completed order collection published orders instead of blaming an empty database', async () => {
    mockProfitLossQuery({ period: '2026-04', rows: [], totals: unavailableTotals, basis: completeBasis });
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByText('완료된 주문 수집이 발행한 주문이 없어 손익표가 비어 있습니다.')).toBeTruthy();
    });
    expect(screen.queryByText(/현재 DB/)).toBeNull();
    expect(screen.queryByText(/Drive replay/)).toBeNull();
  });

  /** KID-85 follow-up P3-2 and P3-13 — the cards render server totals, not browser arithmetic. */
  it("renders the server's ad cost share and the totals no product row carries", async () => {
    mockProfitLossQuery({
      period: '2026-04',
      rows: [{
        listingId: '11111111-1111-4111-8111-111111111111',
        externalId: 'EXT-1',
        channelName: '쿠팡',
        masterId: '22222222-2222-4222-8222-222222222222',
        masterCode: 'M-1',
        masterName: '측정된 상품',
        category: null,
        grade: 'A',
        thumbnailUrl: null,
        revenue: 20_000,
        cogs: 5_000,
        commission: 0,
        shippingCost: 3_000,
        adCost: 2_000,
        otherCost: 0,
        netProfit: 10_000,
        profitRate: 50,
        orderCount: 1,
        returnCount: 0,
      }],
      totals: {
        revenue: 20_000,
        orderCount: 1,
        cost: 11_500,
        adCost: 3_000,
        netProfit: 8_500,
        profitRate: 42.5,
        adCostRate: 12.3,
        unallocatedAdCost: 1_000,
        adCostGrainDifference: 0,
        unallocatedShipping: 500,
      },
      basis: completeBasis,
    });
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByText('12.3% of 매출')).toBeTruthy();
    });
    // 3,000 / 20,000 would be 15.0%: the card shows the server's share.
    expect(screen.queryByText('15.0% of 매출')).toBeNull();
    expect(screen.getByText(
      '상품 행에 없는 금액 — 판매 없는 상품의 광고비 1,000원 · 매출로 배분할 수 없는 배송비 500원. 상품 행은 각각 반올림해 합계와 몇 원 다를 수 있습니다.',
    )).toBeTruthy();
  });

  it('renders error state on rejected promise', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation(async (url: string) => {
      if (url === '/api/sales-analysis/data-sources') return dataSources as any;
      throw new Error('502 Bad Gateway');
    });
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/처리 중 문제가 생겼습니다/)).toBeTruthy();
    });
  });

  it('renders Zod schema drift as user-friendly message', async () => {
    const { ZodError } = await import('zod');
    const zodErr = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['rows', '0', 'listingId'],
        message: 'expected string',
      } as Parameters<typeof ZodError.create>[0][0],
    ]);
    vi.spyOn(apiClient, 'getParsed').mockImplementation(async (url: string) => {
      if (url === '/api/sales-analysis/data-sources') return dataSources as any;
      throw zodErr;
    });
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/처리 중 문제가 생겼습니다/)).toBeTruthy();
    });
  });
});
