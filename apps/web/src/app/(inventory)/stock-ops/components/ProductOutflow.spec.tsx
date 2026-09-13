import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { productAbcReadModel } from '@/test/fixtures/product-abc';
import ProductOutflow from './ProductOutflow';
import type { SellpiaProductSalesSummary } from '@kiditem/shared/dashboard';

const productSalesApi = vi.hoisted(() => ({ fetch: vi.fn() }));
const sourceOwner = vi.hoisted(() => ({ start: vi.fn(), state: null as Record<string, unknown> | null, isStarting: false }));
const freshness = vi.hoisted(() => ({
  state: {
    status: 'refresh_required',
    lastVerifiedAt: '2026-08-01T00:30:00.000Z',
    syncNotBefore: null,
  },
}));

vi.mock('@/lib/sellpia-product-sales-api', () => ({
  fetchSellpiaProductSales: productSalesApi.fetch,
}));
vi.mock('../../_shared/sellpia-inventory-source-owner', () => ({
  useSellpiaInventorySourceOwner: () => sourceOwner,
}));

function renderProductOutflow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProductOutflow />
    </QueryClientProvider>,
  );
}

describe('ProductOutflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productSalesApi.fetch.mockResolvedValue(summary(false));
    sourceOwner.start.mockResolvedValue({ state: 'RUNNING' });
    freshness.state = {
      status: 'refresh_required',
      lastVerifiedAt: '2026-08-01T00:30:00.000Z',
      syncNotBefore: null,
    };
    sourceOwner.state = freshness.state;
  });

  it('requests the inventory-only operation from product outflow', async () => {
    renderProductOutflow();

    fireEvent.click(screen.getByRole('button', { name: '셀피아 재고 동기화' }));

    await waitFor(() => expect(sourceOwner.start).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: '셀피아 재고 동기화' })).toHaveAttribute(
      'title',
      expect.stringContaining('현재고만 동기화'),
    );
  });

  it('keeps failed inventory refreshes on the inventory-only operation scope', async () => {
    freshness.state = {
      status: 'failed',
      lastVerifiedAt: '2026-08-01T00:30:00.000Z',
      syncNotBefore: null,
    };
    sourceOwner.state = freshness.state;
    renderProductOutflow();

    fireEvent.click(screen.getByRole('button', { name: '셀피아 재고 동기화' }));

    await waitFor(() => expect(sourceOwner.start).toHaveBeenCalledTimes(1));
  });

  it('keeps ABC evidence in rows but removes ABC-specific filters from outflow', async () => {
    productSalesApi.fetch.mockResolvedValueOnce(summary(true));
    renderProductOutflow();

    expect(await screen.findByText('계산 완료 상품')).toBeInTheDocument();
    expect(screen.getByText('매핑 필요 상품')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /A등급\s*1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ABC 매핑 필요/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /재계산 중/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /셀피아 갱신 필요/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /광고비 갱신 필요/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /계산 확인/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /미분류\s*1/ })).toBeInTheDocument();
  });

  it('does not show the retired formula-calibration status as a stock filter', async () => {
    productSalesApi.fetch.mockResolvedValueOnce(summary(true));
    renderProductOutflow();

    await screen.findByText('계산 완료 상품');
    expect(screen.queryByRole('button', { name: /수식 보정 대기/ })).not.toBeInTheDocument();
  });

  it('renders MasterProduct ABC grades in the first table column', async () => {
    productSalesApi.fetch.mockResolvedValueOnce(summary(true));
    renderProductOutflow();

    const headers = await screen.findAllByRole('columnheader');
    expect(headers[0]).toHaveTextContent('등급');
    const row = screen.getByRole('row', { name: /계산 완료 상품/ });
    const cells = within(row).getAllByRole('cell');
    expect(within(cells[0]!).getByLabelText('A등급')).toBeInTheDocument();
    expect(within(cells[4]!).queryByLabelText('A등급')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /A등급\s*1/ }));
    expect(screen.queryByText('매핑 필요 상품')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /미분류\s*1/ }));
    expect(screen.getByText('매핑 필요 상품')).toBeInTheDocument();
    expect(screen.queryByText('계산 완료 상품')).not.toBeInTheDocument();
  });
  it('keeps the A grade visible beside source attention without losing its complete cutoff', async () => {
    const data = summary(true);
    const product = data.products[0]!.inventoryResolution;
    if (product.status !== 'matched' || !product.inventoryProduct) throw new Error('Expected matched product');
    const abc = product.inventoryProduct.abc;
    product.inventoryProduct.abc = {
      ...abc, displayStatus: 'SELLPIA_SOURCE_STALE',
      sources: { ...abc.sources, sellpia: { ...abc.sources.sellpia, ready: false, latestAttemptState: 'FAILED' } },
    };
    productSalesApi.fetch.mockResolvedValueOnce(data);
    renderProductOutflow();
    const row = await screen.findByRole('row', { name: /계산 완료 상품/ });
    expect(within(row).getByLabelText('A등급')).toBeInTheDocument();
    expect(within(row).getByText('원천 확인')).toHaveAttribute('title', expect.stringContaining('데이터 기준 2026-07-31'));
  });

});

function summary(hasData: boolean): SellpiaProductSalesSummary {
  const rows = hasData ? [
    row('ready', '계산 완료 상품', productAbcReadModel()),
    row('unmapped', '매핑 필요 상품', productAbcReadModel({ evaluation: null, displayStatus: 'SOURCE_UNMAPPED' })),
  ] : [];
  return {
    range: { from: '2026-07', to: '2026-07' },
    months: ['2026-07'],
    completeMonths: ['2026-07'],
    products: rows,
    productCount: rows.length,
    totalQty: rows.length,
    lastCapturedAt: '2026-08-01T01:00:00.000Z',
    hasData,
    hasStock: hasData,
    stockCapturedAt: hasData ? '2026-08-01T01:00:00.000Z' : null,
    stockGeneration: hasData ? '1' : null,
    inventoryResolutionCounts: {
      matchedSalesRows: rows.length,
      mappingRequiredSalesRows: 0,
      matchedSkus: rows.length,
      unlinkedSkus: 0,
    },
    reorderCount: 0,
    deadStockCount: 0,
    anomalyCount: 0,
    abcCounts: { A: hasData ? 1 : 0, B: 0, C: 0 },
    abcStatusCounts: {
      READY: hasData ? 1 : 0,
      INSUFFICIENT_EVIDENCE: 0,
      SOURCE_UNMAPPED: hasData ? 1 : 0,
      SELLPIA_SOURCE_STALE: 0,
      AD_SOURCE_STALE: 0,
    },
    abcContributionProfitByGrade: { A: hasData ? 120_000 : 0, B: 0, C: 0 },
    classifiedProductCount: hasData ? 1 : 0,
    unclassifiedProductCount: hasData ? 1 : 0,
    leadTimeMonths: 1,
  };
}

function row(
  suffix: string,
  productName: string,
  abc: ReturnType<typeof productAbcReadModel>,
): SellpiaProductSalesSummary['products'][number] {
  return {
    productCode: `SKU-${suffix}`,
    optionCode: '',
    productName,
    optionName: null,
    providerName: '공급처',
    salePrice: 1_000,
    buyPrice: 500,
    barcode: suffix,
    monthly: [{ yearMonth: '2026-07', orderQty: 1 }],
    qty1m: 1,
    qty2m: 1,
    avg2m: 1,
    totalQty: 1,
    trend: 'flat',
    deadStock: false,
    deadStockReason: null,
    seasonTag: null,
    anomaly: false,
    anomalyReason: null,
    inventoryResolution: {
      status: 'matched',
      sellpiaInventorySkuId: `11111111-1111-4111-8111-${suffix.padEnd(12, '0').slice(0, 12)}`,
      currentStock: 10,
      availableStock: 10,
      salesRowCount: 1,
      inventoryProduct: {
        masterProductId: `21111111-1111-4111-8111-${suffix.padEnd(12, '0').slice(0, 12)}`,
        masterProductCode: `MP-${suffix}`,
        masterProductName: productName,
        abc,
      },
      destinations: [{
        masterProductId: `21111111-1111-4111-8111-${suffix.padEnd(12, '0').slice(0, 12)}`,
        masterProductCode: `MP-${suffix}`,
        masterProductName: productName,
        channelListingOptionId: `31111111-1111-4111-8111-${suffix.padEnd(12, '0').slice(0, 12)}`,
        channelListingId: `41111111-1111-4111-8111-${suffix.padEnd(12, '0').slice(0, 12)}`,
        channel: 'coupang',
        externalOptionId: `OPTION-${suffix}`,
        optionName: '기본 옵션',
        unitsPerSale: 1,
        abc,
        displayImage: null,
      }],
    },
    monthsOfAvailableStockLeft: 10,
    reorderPoint: 0,
    needsReorder: false,
  };
}
