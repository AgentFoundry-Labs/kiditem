import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const productSalesApi = vi.hoisted(() => ({
  fetch: vi.fn(),
  ingest: vi.fn(),
}));
const productProfitCollection = vi.hoisted(() => vi.fn());
const requestRefresh = vi.hoisted(() => vi.fn());

vi.mock('@/lib/sellpia-product-sales-api', () => ({
  fetchSellpiaProductSales: productSalesApi.fetch,
  ingestSellpiaProductSales: productSalesApi.ingest,
}));
vi.mock('@/lib/sellpia-product-sales-collection', () => ({
  collectSellpiaProductProfitFromExtension: productProfitCollection,
}));
vi.mock('@/hooks/useSellpiaInventoryFreshness', () => ({
  useSellpiaInventoryFreshness: () => ({ requestRefresh }),
}));
vi.mock('@/lib/browser-storage', () => ({
  safeStorageGet: () => '2026-07-17',
  safeStorageSet: vi.fn(),
}));

import ProductOutflow from './ProductOutflow';

function renderProductOutflow() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProductOutflow />
    </QueryClientProvider>,
  );
}

describe('ProductOutflow canonical Sellpia refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-17T01:00:00.000Z'));
    productSalesApi.fetch.mockResolvedValue({
      range: { from: '2026-07', to: '2026-07' },
      months: [],
      completeMonths: [],
      products: [],
      productCount: 0,
      totalQty: 0,
      lastCapturedAt: null,
      hasData: false,
      hasStock: false,
      stockCapturedAt: null,
      reorderCount: 0,
      deadStockCount: 0,
      anomalyCount: 0,
      abcCounts: { a: 0, b: 0, c: 0 },
      leadTimeMonths: 1,
    });
    productProfitCollection.mockResolvedValue({
      range: { from: '2026-07-01', to: '2026-07-16' },
      products: [],
    });
    productSalesApi.ingest.mockResolvedValue({
      upserted: 0,
      productCount: 0,
      months: [],
    });
    requestRefresh.mockResolvedValue({ status: 'refresh_required' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps product-profit collection and delegates stock refresh to the shared coordinator', async () => {
    renderProductOutflow();

    fireEvent.click(screen.getByRole('button', { name: '지금 수집' }));

    await waitFor(() => expect(productProfitCollection).toHaveBeenCalledTimes(1));
    expect(productSalesApi.ingest).toHaveBeenCalledTimes(1);
    expect(requestRefresh).toHaveBeenCalledWith('manual_request');
  });

  it('renders PR 329 depletion and stock signals from the canonical inventory summary', async () => {
    productSalesApi.fetch.mockResolvedValueOnce({
      range: { from: '2026-05', to: '2026-06' },
      months: ['2026-05', '2026-06'],
      completeMonths: ['2026-05', '2026-06'],
      products: [
        {
          productCode: 'REORDER',
          optionCode: '',
          productName: '발주 대상 상품',
          optionName: null,
          providerName: '공급처 A',
          salePrice: 1_000,
          buyPrice: 500,
          barcode: '880-REORDER',
          monthly: [
            { yearMonth: '2026-05', orderQty: 400 },
            { yearMonth: '2026-06', orderQty: 400 },
          ],
          qty1m: 400,
          qty2m: 800,
          avg2m: 400,
          totalQty: 800,
          abcGrade: 'A',
          trend: 'flat',
          deadStock: false,
          deadStockReason: null,
          seasonTag: '여름',
          anomaly: false,
          anomalyReason: null,
          currentStock: 200,
          monthsOfStockLeft: 0.5,
          reorderPoint: 600,
          needsReorder: true,
        },
        {
          productCode: 'ANOMALY',
          optionCode: '',
          productName: '이상치 재고 상품',
          optionName: null,
          providerName: '공급처 B',
          salePrice: 50,
          buyPrice: 20,
          barcode: '880-ANOMALY',
          monthly: [
            { yearMonth: '2026-05', orderQty: 60_000, anomaly: true },
            { yearMonth: '2026-06', orderQty: 0 },
          ],
          qty1m: 0,
          qty2m: 0,
          avg2m: 0,
          totalQty: 0,
          abcGrade: 'C',
          trend: 'down',
          deadStock: true,
          deadStockReason: '재고 정체(2개월+ 미판매)',
          seasonTag: null,
          anomaly: true,
          anomalyReason: '저가 대량(단가 50원)',
          currentStock: 50,
          monthsOfStockLeft: null,
          reorderPoint: 0,
          needsReorder: false,
        },
      ],
      productCount: 2,
      totalQty: 60_800,
      lastCapturedAt: '2026-07-17T01:00:00.000Z',
      hasData: true,
      hasStock: true,
      stockCapturedAt: '2026-07-17T00:30:00.000Z',
      reorderCount: 1,
      deadStockCount: 1,
      anomalyCount: 1,
      abcCounts: { a: 1, b: 0, c: 1 },
      leadTimeMonths: 1,
    });

    renderProductOutflow();

    expect(await screen.findByText('발주 대상 상품')).toBeInTheDocument();
    expect(screen.getByText('이상치 재고 상품')).toBeInTheDocument();
    expect(screen.getByText('여름')).toBeInTheDocument();
    expect(screen.getByLabelText('보합')).toBeInTheDocument();
    expect(screen.getByLabelText('하락')).toBeInTheDocument();
    expect(screen.getAllByText('발주 필요')).toHaveLength(2);
    expect(screen.getByText('악성 · 재고 정체(2개월+ 미판매)')).toBeInTheDocument();
    expect(screen.getByText('이상치 · 저가 대량(단가 50원)')).toBeInTheDocument();
    expect(screen.getByTitle('이상치(일회성 벌크) — 평균·발주 산정 제외')).toHaveTextContent('60,000');

    fireEvent.click(screen.getByRole('button', { name: /이상치\s*1/ }));
    await waitFor(() => expect(screen.queryByText('발주 대상 상품')).not.toBeInTheDocument());
    expect(screen.getByText('이상치 재고 상품')).toBeInTheDocument();
  });
});
