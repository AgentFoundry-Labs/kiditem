import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ProductTrackingPage } from './ProductTrackingPage';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    delete: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@/lib/extension-bridge', () => ({
  isChromeExtensionRuntimeAvailable: () => false,
}));

vi.mock('./WingTrackedHistoryChart', () => ({
  WingTrackedHistoryChart: () => <div>history chart</div>,
  TrendSparkline: () => <div>trend sparkline</div>,
}));

const BASE = '/api/ads/wing-tracked-products';

function product(index: number) {
  const suffix = String(index + 1).padStart(12, '0');
  return {
    id: `11111111-1111-4111-8111-${suffix}`,
    productId: `wing-${index + 1}`,
    itemId: null,
    vendorItemId: null,
    productName: `추적 상품 ${index + 1}`,
    imagePath: null,
    brandName: null,
    categoryHierarchy: null,
    sourceKeyword: `키워드 ${index + 1}`,
    enabled: true,
    lastCapturedAt: null,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
    latestSnapshot: null,
  };
}

describe('ProductTrackingPage bulk history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads 24 tracked cards through one bulk history request and zero per-product history requests', async () => {
    const products = Array.from({ length: 24 }, (_, index) => product(index));
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === BASE) return products;
      if (path === `${BASE}/history?days=30`) {
        return {
          items: products.map((item) => ({
            trackedProductId: item.id,
            productName: item.productName,
            points: [],
          })),
        };
      }
      if (/\/[^/]+\/history\?days=30$/.test(path)) {
        return { trackedProductId: 'unexpected', productName: 'unexpected', points: [] };
      }
      throw new Error(`unexpected request: ${path}`);
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <ProductTrackingPage />
      </QueryClientProvider>,
    );

    await screen.findByText('추적 상품 1');
    await waitFor(() => expect(screen.getByText(/추적 상품 24개/)).toBeInTheDocument());

    const paths = vi.mocked(apiClient.get).mock.calls.map(([path]) => path);
    expect(paths.filter((path) => path === `${BASE}/history?days=30`)).toHaveLength(1);
    expect(paths.filter((path) => (
      path !== `${BASE}/history?days=30`
      && /\/[^/]+\/history\?days=30$/.test(path)
    ))).toHaveLength(0);
  });
});
