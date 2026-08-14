import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { searchWingCatalogProducts } from '../../wing-catalog/lib/wing-catalog-extension';
import { useSourcingOperationAction } from '../../hooks/use-sourcing-operation-action';
import { ProductTrackingPage } from './ProductTrackingPage';

const start = vi.fn(async () => ({ id: '10000000-0000-4000-8000-000000000001' }));
const BASE = '/api/ads/wing-tracked-products';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), delete: vi.fn(), post: vi.fn() },
}));

vi.mock('@/lib/extension-bridge', () => ({
  isChromeExtensionRuntimeAvailable: () => true,
  wakeBrowserOperationRuntime: vi.fn(async () => true),
}));

vi.mock('../../hooks/use-sourcing-operation-action', () => ({
  useSourcingOperationAction: vi.fn(() => ({
    run: null,
    start,
    cancel: vi.fn(),
    retryAttention: vi.fn(),
    isStarting: false,
    isCancelling: false,
    isRetrying: false,
  })),
}));

vi.mock('../../wing-catalog/lib/wing-catalog-extension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../wing-catalog/lib/wing-catalog-extension')>();
  return { ...actual, searchWingCatalogProducts: vi.fn() };
});

vi.mock('./WingTrackedHistoryChart', () => ({
  WingTrackedHistoryChart: () => <div>history chart</div>,
  TrendSparkline: () => <div>trend sparkline</div>,
}));

function trackedProduct(index: number) {
  return {
    id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
    productId: `wing-${index + 1}`,
    itemId: null,
    vendorItemId: null,
    productName: `추적 상품 ${index + 1}`,
    imagePath: null,
    brandName: null,
    categoryHierarchy: null,
    sourceKeyword: index === 0 ? '  Ａ   Pencil  ' : `키워드 ${index + 1}`,
    enabled: true,
    lastCapturedAt: null,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
    latestSnapshot: null,
  };
}

describe('ProductTrackingPage Wing operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const products = Array.from({ length: 12 }, (_, index) => trackedProduct(index));
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
      if (path === BASE) return products;
      if (path === `${BASE}/history?days=30`) return { items: [] };
      throw new Error(`unexpected request: ${path}`);
    });
  });

  it('starts one tracked-metrics operation and never runs the legacy client loop', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ProductTrackingPage />
      </QueryClientProvider>,
    );

    await screen.findByText('추적 상품 1');
    expect(start).not.toHaveBeenCalled();
    expect(searchWingCatalogProducts).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '지표 새로고침' }));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(useSourcingOperationAction).toHaveBeenLastCalledWith(expect.objectContaining({
      operationKey: 'advertising.refresh_tracked_wing_products',
      input: {
        keywords: ['A Pencil', ...Array.from({ length: 11 }, (_, index) => `키워드 ${index + 2}`)],
        maxPages: 2,
        purpose: 'tracked_metrics',
        trackedProductIds: Array.from({ length: 12 }, (_, index) => `wing-${index + 1}`),
      },
      snapshotQueryKey: queryKeys.sourcing.wingTrackedProducts(),
      snapshotQueryKeys: [
        queryKeys.sourcing.wingTrackedProducts(),
        queryKeys.sourcing.wingTrackedHistories(30),
      ],
    }));
    expect(searchWingCatalogProducts).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
