import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  AdStrategyAction,
  AdWeeklyPlan,
} from '@kiditem/shared/advertising';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import StrategyContent from './StrategyContent';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    getParsed: vi.fn(),
  },
}));

vi.mock('../lib/xlsx-export', () => ({
  exportCampaignXlsx: vi.fn(),
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
  tierAnalysis: [],
  top20: [],
  accountSummary: null,
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

function Harness() {
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  return (
    <StrategyContent
      strategy={strategy}
      rules={[]}
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

function renderStrategy() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
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
