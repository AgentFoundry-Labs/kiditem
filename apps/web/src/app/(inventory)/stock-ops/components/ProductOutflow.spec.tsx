import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SellpiaProductSalesSummary } from '@kiditem/shared/dashboard';
import { productAbcEvaluation } from '@/test/fixtures/product-abc';

const productSalesApi = vi.hoisted(() => ({ fetch: vi.fn() }));
const requestRefresh = vi.hoisted(() => vi.fn());
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
vi.mock('@/hooks/useSellpiaInventoryFreshness', () => ({
  useSellpiaInventoryFreshness: () => ({ requestRefresh, state: freshness.state }),
}));

import ProductOutflow from './ProductOutflow';

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
    requestRefresh.mockResolvedValue({ id: 'operation-run-1' });
    freshness.state = {
      status: 'refresh_required',
      lastVerifiedAt: '2026-08-01T00:30:00.000Z',
      syncNotBefore: null,
    };
  });

  it('requests the inventory-only operation from product outflow', async () => {
    renderProductOutflow();

    fireEvent.click(screen.getByRole('button', { name: '셀피아 재고 동기화' }));

    await waitFor(() => expect(requestRefresh).toHaveBeenCalledWith('inventory'));
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
    renderProductOutflow();

    fireEvent.click(screen.getByRole('button', { name: '셀피아 재고 동기화' }));

    await waitFor(() => expect(requestRefresh).toHaveBeenCalledWith('inventory'));
  });

  it('shows automatic ABC statuses and filters linked products by calculation status', async () => {
    productSalesApi.fetch.mockResolvedValueOnce(summary(true));
    renderProductOutflow();

    expect(await screen.findByText('계산 완료 상품')).toBeInTheDocument();
    expect(screen.getByText('매핑 필요 상품')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ABC 매핑 필요\s*1/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ABC 매핑 필요\s*1/ }));
    await waitFor(() => expect(screen.queryByText('계산 완료 상품')).not.toBeInTheDocument());
    expect(screen.getByText('매핑 필요 상품')).toBeInTheDocument();
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
  });
});

function summary(hasData: boolean): SellpiaProductSalesSummary {
  const rows = hasData ? [
    row('ready', '계산 완료 상품', 'A', productAbcEvaluation()),
    row('unmapped', '매핑 필요 상품', null, productAbcEvaluation({
      abcGrade: null,
      calculationStatus: 'SOURCE_UNMAPPED',
      formula: null,
      rawScore: null,
      adjustedScore: null,
      reliability: null,
      weightedContributionProfit: null,
    })),
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
      CALIBRATION_PENDING: 0,
      RECALCULATING: 0,
      SELLPIA_SOURCE_STALE: 0,
      AD_SOURCE_STALE: 0,
      ORDERS_SOURCE_STALE: 0,
      CALCULATION_ERROR: 0,
    },
    abcContributionProfitByGrade: { A: hasData ? 120_000 : 0, B: 0, C: 0 },
    classifiedProductCount: hasData ? 1 : 0,
    unclassifiedProductCount: 0,
    leadTimeMonths: 1,
  };
}

function row(
  suffix: string,
  productName: string,
  abcGrade: 'A' | 'B' | 'C' | null,
  abcEvaluation: ReturnType<typeof productAbcEvaluation>,
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
      activeCommitmentQuantity: 0,
      availableStock: 10,
      salesRowCount: 1,
      inventoryProduct: {
        masterProductId: `21111111-1111-4111-8111-${suffix.padEnd(12, '0').slice(0, 12)}`,
        masterProductCode: `MP-${suffix}`,
        masterProductName: productName,
        abcGrade,
        abcEvaluation,
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
        abcGrade,
        abcEvaluation,
        displayImage: null,
      }],
    },
    monthsOfAvailableStockLeft: 10,
    reorderPoint: 0,
    needsReorder: false,
  };
}
