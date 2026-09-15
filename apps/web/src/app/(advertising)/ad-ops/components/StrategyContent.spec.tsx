import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import StrategyContent from './StrategyContent';
import type {
  AdsHubData,
  AdStrategyAction,
  AdTrendsData,
  AdWeeklyPlan,
} from '@kiditem/shared/advertising';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    getParsed: vi.fn(),
  },
}));

vi.mock('../lib/xlsx-export', () => ({
  exportCampaignXlsx: vi.fn().mockResolvedValue(undefined),
}));

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const SKU_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';

const action: AdStrategyAction = {
  listing: {
    listingId: LISTING_ID,
    externalId: 'external-product-1',
    channelName: '테스트 채널 상품',
    masterProduct: {
      id: '44444444-4444-4444-8444-444444444444',
      code: 'MASTER-1',
      name: '마스터 상품',
    },
    option: null,
  },
  grade: 'A',
  actionType: 'maintain',
  priority: 'high',
  reason: '테스트 근거',
  currentValue: 350,
  proposedValue: null,
  channelState: null,
};

const strategy: AdWeeklyPlan = {
  week: { start: '2026-07-06', end: '2026-07-12' },
  actions: [action],
  issues: { zeroConversion: [], lowRoas: [], highSpend: [] },
  top20: [],
  profitWithheldListings: 0,
  orderWindowComplete: true,
};

function hubProduct(
  listingId: string,
  name: string,
  spend: number,
): AdsHubData['products'][number] {
  return {
    listingId,
    externalId: `external-${listingId}`,
    channelName: name,
    masterProduct: {
      id: '55555555-5555-4555-8555-555555555555',
      code: `MASTER-${listingId}`,
      name,
    },
    option: null,
    metrics: {
      spend,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      ctr: null,
      roas: null,
      cvr: null,
    },
    grade: 'A',
  };
}

const hub: AdsHubData = {
  products: [
    hubProduct('66666666-6666-4666-8666-666666666666', '광고비 쓴 상품', 12_000),
    hubProduct('77777777-7777-4777-8777-777777777777', '광고비 없는 상품', 0),
  ],
  summary: {
    totalSpend: 12_000,
    totalRevenue: 0,
    totalRoas: null,
    gradeSpend: { A: 12_000, B: 0, C: 0 },
    gradeSpendPercent: { A: 100, B: 0, C: 0 },
  },
  abcOfficialCutoffDate: '2026-07-31',
};

function availabilityResponse(sellableStock: number | null) {
  return {
    items: [
      {
        channelAccount: { id: ACCOUNT_ID, channel: 'coupang', name: '쿠팡' },
        product: {
          id: LISTING_ID,
          externalProductId: 'external-product-1',
          registeredName: '테스트 채널 상품',
          displayName: null,
          status: 'active',
        },
        sku: {
          id: SKU_ID,
          externalSkuId: 'external-sku-1',
          sellerSku: 'SELLER-SKU-1',
          optionName: '파랑',
          barcode: null,
          modelNumber: null,
          salePrice: 12_000,
          status: 'active',
          mappingStatus: sellableStock === null ? 'unmatched' : 'matched',
          sellableStock,
          updatedAt: '2026-07-12T00:00:00.000Z',
        },
        components: [],
        warnings: [],
      },
    ],
    total: 1,
    page: 1,
    limit: 100,
    summary: {
      total: 1,
      inStock: sellableStock && sellableStock > 0 ? 1 : 0,
      outOfStock: sellableStock === 0 ? 1 : 0,
      unmatched: sellableStock === null ? 1 : 0,
      needsReview: 0,
    },
  };
}

function Harness({ trends }: { trends: AdTrendsData | null }) {
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  return (
    <StrategyContent
      strategy={strategy}
      rules={[]}
      trends={trends}
      period="14d"
      totalBudget={100_000}
      budgetInput="100,000"
      expandedProduct={expandedProduct}
      gradeFilter={{ A: 'all', B: 'all', C: 'all' }}
      gradeSearch={{ A: '', B: '', C: '' }}
      selectedGrade={null}
      onBudgetChange={vi.fn()}
      onExpandProduct={setExpandedProduct}
      onGradeFilter={vi.fn()}
      onGradeSearch={vi.fn()}
      onSelectGrade={vi.fn()}
      onOpenRegisterModal={vi.fn()}
      onRefresh={vi.fn()}
      isRefreshing={false}
    />
  );
}

function renderStrategy(trends: AdTrendsData | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness trends={trends} />
    </QueryClientProvider>,
  );
}

describe('StrategyContent ChannelSku availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ items: [] });
  });

  it.each([
    [0, '판매 가능 0개'],
    [null, '판매 가능 재고 미확인'],
  ] as const)('renders exact sellableStock %s as %s', async (sellableStock, expected) => {
    vi.mocked(apiClient.getParsed).mockResolvedValue(
      availabilityResponse(sellableStock),
    );
    renderStrategy();

    fireEvent.click(await screen.findByText('테스트 채널 상품'));

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('loads grade cards from the listing-owned ads hub', async () => {
    renderStrategy();

    await waitFor(() => {
      expect(apiClient.getParsed).toHaveBeenCalledWith('/api/ads/hub', expect.anything());
    });
    expect(apiClient.get).not.toHaveBeenCalledWith(expect.stringContaining('/api/products'));
  });
});

describe('StrategyContent account totals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ items: [] });
  });

  it('reads account totals from the campaign-sweep trends summary and keeps unmeasured values unknown', async () => {
    renderStrategy({
      knownThrough: '2026-07-12',
      from: '2026-06-29',
      to: '2026-07-12',
      daily: [],
      summary: {
        periodDayCount: 14,
        latestBusinessDate: '2026-07-12',
        observedAt: '2026-07-13T00:00:00.000Z',
        metrics: {
          spend: 1_000,
          revenue: 0,
          impressions: 0,
          clicks: 0,
          conversions: null,
          roas: null,
          ctr: null,
          cvr: null,
        },
        orders: null,
      },
    });

    const card = await screen.findByTestId('strategy-account-totals');
    expect(card).toHaveTextContent('측정 14일 · 쿠팡 광고 캠페인 합산 · 2026-07-12까지');
    expect(within(card).getByText('1,000원')).toBeInTheDocument();
    expect(within(card).getByText('-')).toBeInTheDocument();
    expect(within(card).getAllByText('- / -')).toHaveLength(2);
    expect(card).not.toHaveTextContent('0.00%');
  });
});

describe('StrategyContent grade card advertising status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ items: [] });
  });

  it('labels hub products from their measured spend instead of an operator tier', async () => {
    vi.mocked(apiClient.getParsed).mockImplementation(((url: string) => Promise.resolve(
      url === '/api/ads/hub' ? hub : availabilityResponse(3),
    )) as never);
    renderStrategy();

    const card = await screen.findByTestId('strategy-grade-card-A');
    expect(await within(card).findByText('광고비 쓴 상품')).toBeInTheDocument();
    expect(within(card).getByText('광고비 없는 상품')).toBeInTheDocument();
    expect(within(card).getByText('광고비 발생')).toBeInTheDocument();
    expect(within(card).getByText('광고비 0원')).toBeInTheDocument();
    // Header chip and filter tab both count the one product with measured spend.
    expect(within(card).getAllByText('광고비 발생 1')).toHaveLength(2);
    expect(card).not.toHaveTextContent('광고중');
    expect(card).not.toHaveTextContent('추천 없음');

    fireEvent.click(within(card).getByRole('button', { name: '광고비 0원 1' }));

    expect(within(card).queryByText('광고비 쓴 상품')).not.toBeInTheDocument();
    expect(within(card).queryByText('테스트 채널 상품')).not.toBeInTheDocument();
    expect(within(card).getByText('광고비 없는 상품')).toBeInTheDocument();
  });
});

describe('StrategyContent grade card ABC publication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ items: [] });
  });

  it('shows grade membership counts as unknown, not 0, before Products publishes ABC', async () => {
    const unpublishedHub: AdsHubData = {
      products: hub.products.map((product) => ({ ...product, grade: null })),
      summary: {
        ...hub.summary,
        gradeSpend: { A: 0, B: 0, C: 0 },
        gradeSpendPercent: { A: 0, B: 0, C: 0 },
      },
      abcOfficialCutoffDate: null,
    };
    vi.mocked(apiClient.getParsed).mockImplementation(((url: string) => Promise.resolve(
      url === '/api/ads/hub' ? unpublishedHub : availabilityResponse(3),
    )) as never);
    renderStrategy();

    for (const grade of ['A', 'B', 'C'] as const) {
      const card = await screen.findByTestId(`strategy-grade-card-${grade}`);
      await waitFor(() => expect(card).toHaveTextContent('-상품'));
      expect(card).not.toHaveTextContent('0개');
      expect(within(card).getByRole('button', { name: '전체 -' })).toBeInTheDocument();
    }
  });

  it('keeps a measured 0 once Products has published ABC', async () => {
    vi.mocked(apiClient.getParsed).mockImplementation(((url: string) => Promise.resolve(
      url === '/api/ads/hub' ? hub : availabilityResponse(3),
    )) as never);
    renderStrategy();

    await waitFor(() => {
      expect(screen.getByTestId('strategy-grade-card-A')).toHaveTextContent('2개상품');
    });
    const cardB = screen.getByTestId('strategy-grade-card-B');
    expect(cardB).toHaveTextContent('0개상품');
    expect(within(cardB).getByRole('button', { name: '전체 0' })).toBeInTheDocument();
  });
});
