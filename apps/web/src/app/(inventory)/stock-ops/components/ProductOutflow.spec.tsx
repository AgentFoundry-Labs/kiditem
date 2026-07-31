import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const productSalesApi = vi.hoisted(() => ({
  fetch: vi.fn(),
}));
const requestRefresh = vi.hoisted(() => vi.fn());
const freshness = vi.hoisted(() => ({
  state: {
    status: 'refresh_required',
    lastVerifiedAt: '2026-07-17T00:30:00.000Z',
    syncNotBefore: null as string | null,
    unresolvedOrderTransmissionIntents: [] as Array<{
      intentKey: string;
      preparedAt: string;
    }>,
  },
}));
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/sellpia-product-sales-api', () => ({
  fetchSellpiaProductSales: productSalesApi.fetch,
}));
vi.mock('@/hooks/useSellpiaInventoryFreshness', () => ({
  useSellpiaInventoryFreshness: () => ({ requestRefresh, state: freshness.state }),
}));
import ProductOutflow from './ProductOutflow';

function renderProductOutflow() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    ...render(
    <QueryClientProvider client={client}>
      <ProductOutflow />
    </QueryClientProvider>,
    ),
  };
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
      stockGeneration: null,
      inventoryResolutionCounts: {
        matchedSalesRows: 0,
        mappingRequiredSalesRows: 0,
        matchedSkus: 0,
        unlinkedSkus: 0,
      },
      reorderCount: 0,
      deadStockCount: 0,
      anomalyCount: 0,
      abcCounts: { A: 0, B: 0, C: 0 },
      abcLifecycleCounts: { NEW: 0, PROVISIONAL: 0, ESTABLISHED: 0 },
      abcRiskCounts: { loss: 0, zeroValue: 0, dataQuality: 0 },
      classifiedProductCount: 0,
      unclassifiedProductCount: 0,
      leadTimeMonths: 1,
    });
    requestRefresh.mockResolvedValue({
      status: 'refresh_required',
      syncNotBefore: null,
      unresolvedOrderTransmissionIntents: [],
    });
    freshness.state = {
      status: 'refresh_required',
      lastVerifiedAt: '2026-07-17T00:30:00.000Z',
      syncNotBefore: null,
      unresolvedOrderTransmissionIntents: [],
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers one Sellpia sync action and delegates both datasets to the shared coordinator', async () => {
    renderProductOutflow();

    fireEvent.click(screen.getByRole('button', { name: /셀피아 동기화/ }));

    await waitFor(() => expect(requestRefresh).toHaveBeenCalledWith('manual_request'));
    expect(screen.queryByRole('button', { name: '지금 수집' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /재고 동기화/ })).not.toBeInTheDocument();
  });

  it('retries the failed Sellpia generation from the unified sync action', async () => {
    freshness.state = {
      status: 'failed',
      lastVerifiedAt: '2026-07-17T00:30:00.000Z',
      syncNotBefore: null,
      unresolvedOrderTransmissionIntents: [],
    };
    renderProductOutflow();

    fireEvent.click(screen.getByRole('button', { name: /셀피아 동기화/ }));

    await waitFor(() => expect(requestRefresh).toHaveBeenCalledWith('retry'));
  });

  it('renders shared syncing freshness as a disabled unified sync action', () => {
    freshness.state = {
      status: 'syncing',
      lastVerifiedAt: '2026-07-17T00:30:00.000Z',
      syncNotBefore: null,
      unresolvedOrderTransmissionIntents: [],
    };
    renderProductOutflow();

    expect(screen.getByText('갱신 중')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /셀피아 동기화/ })).toBeDisabled();
    expect(requestRefresh).not.toHaveBeenCalled();
  });

  it('keeps freshness details beside the sync action instead of packing them into the button', () => {
    renderProductOutflow();

    const button = screen.getByRole('button', { name: '셀피아 동기화' });
    expect(button).not.toHaveTextContent('갱신 필요');
    expect(button).not.toHaveTextContent('30분 전');
    expect(screen.getByText('갱신 필요')).toBeInTheDocument();
    expect(screen.getByText('30분 전')).toBeInTheDocument();
  });

  it('keeps Sellpia sync available without exposing unresolved transmission bookkeeping', async () => {
    const unresolved = {
      status: 'refresh_required',
      lastVerifiedAt: '2026-07-17T00:30:00.000Z',
      syncNotBefore: null,
      unresolvedOrderTransmissionIntents: [
        {
          intentKey: '1785076954061-kidsnote-browser',
          preparedAt: '2026-07-16T14:42:38.482Z',
        },
      ],
    };
    freshness.state = unresolved;
    requestRefresh.mockResolvedValue(unresolved);
    renderProductOutflow();

    expect(screen.queryByText('전송 확인 필요 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /셀피아 동기화/ }));

    await waitFor(() => expect(requestRefresh).toHaveBeenCalledWith('manual_request'));
    expect(toastMock.success).toHaveBeenCalledWith(
      '셀피아 동기화 요청을 보냈습니다. 곧 시작합니다.',
    );
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('reports the settle window when the sync is genuinely queued', async () => {
    requestRefresh.mockResolvedValue({
      status: 'refresh_required',
      syncNotBefore: '2026-07-17T01:02:00.000Z',
      unresolvedOrderTransmissionIntents: [],
    });
    renderProductOutflow();

    fireEvent.click(screen.getByRole('button', { name: /셀피아 동기화/ }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(
      '셀피아 동기화 요청을 보냈습니다. 약 120초 후 시작합니다.',
    ));
    expect(toastMock.error).not.toHaveBeenCalled();
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
          trend: 'flat',
          deadStock: false,
          deadStockReason: null,
          seasonTag: '여름',
          anomaly: false,
          anomalyReason: null,
          inventoryResolution: {
            status: 'matched',
            sellpiaInventorySkuId: '11111111-1111-4111-8111-111111111111',
            currentStock: 200,
            activeCommitmentQuantity: 50,
            availableStock: 150,
            salesRowCount: 2,
            destinations: [{
              masterProductId: '21111111-1111-4111-8111-111111111111',
              masterProductCode: 'MP-1',
              masterProductName: '운영 상품',
              productVariantId: '31111111-1111-4111-8111-111111111111',
              productVariantCode: 'PV-1',
              productVariantName: '기본 옵션',
              unitsPerVariant: 1,
              abcGrade: 'A',
              abcEvaluation: abcEvaluation({ abcGrade: 'A' }),
              displayImage: null,
            }],
          },
          monthsOfAvailableStockLeft: 0.38,
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
          trend: 'down',
          deadStock: true,
          deadStockReason: '재고 정체(2개월+ 미판매)',
          seasonTag: null,
          anomaly: true,
          anomalyReason: '저가 대량(단가 50원)',
          inventoryResolution: {
            status: 'matched',
            sellpiaInventorySkuId: '41111111-1111-4111-8111-111111111111',
            currentStock: 50,
            activeCommitmentQuantity: 0,
            availableStock: 50,
            salesRowCount: 1,
            destinations: [{
              masterProductId: '51111111-1111-4111-8111-111111111111',
              masterProductCode: 'MP-NULL',
              masterProductName: '미분류 운영 상품',
              productVariantId: '61111111-1111-4111-8111-111111111111',
              productVariantCode: 'PV-NULL',
              productVariantName: '기본 옵션',
              unitsPerVariant: 1,
              abcGrade: null,
              abcEvaluation: null,
              displayImage: null,
            }],
          },
          monthsOfAvailableStockLeft: null,
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
      stockGeneration: '12',
      inventoryResolutionCounts: {
        matchedSalesRows: 3,
        mappingRequiredSalesRows: 0,
        matchedSkus: 2,
        unlinkedSkus: 1,
      },
      reorderCount: 1,
      deadStockCount: 1,
      anomalyCount: 1,
      abcCounts: { A: 1, B: 0, C: 0 },
      abcLifecycleCounts: { NEW: 0, PROVISIONAL: 0, ESTABLISHED: 1 },
      abcRiskCounts: { loss: 0, zeroValue: 0, dataQuality: 0 },
      classifiedProductCount: 1,
      unclassifiedProductCount: 1,
      leadTimeMonths: 1,
    });

    renderProductOutflow();

    expect(await screen.findByText('발주 대상 상품')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '현재고' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '약정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '가용재고' })).not.toBeInTheDocument();
    expect(screen.getByText('이상치 재고 상품')).toBeInTheDocument();
    expect(screen.getByText('여름')).toBeInTheDocument();
    expect(screen.getByLabelText('보합')).toBeInTheDocument();
    expect(screen.getByLabelText('하락')).toBeInTheDocument();
    expect(screen.getAllByText('발주 필요')).toHaveLength(2);
    expect(screen.getByText('악성 · 재고 정체(2개월+ 미판매)')).toBeInTheDocument();
    expect(screen.getByText('이상치 · 저가 대량(단가 50원)')).toBeInTheDocument();
    expect(screen.getByTitle('이상치(일회성 벌크) — 평균·발주 산정 제외')).toHaveTextContent('60,000');
    expect(screen.getByText('판매 행 2개 수요 합산')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '운영 상품 · 기본 옵션' }))
      .toHaveAttribute('href', '/product-hub/21111111-1111-4111-8111-111111111111');
    expect(screen.getByRole('link', { name: '운영 상품 · 기본 옵션' })).toHaveTextContent('A등급');
    expect(screen.getByRole('link', { name: '미분류 운영 상품 · 기본 옵션' })).toHaveTextContent('미분류');

    fireEvent.click(screen.getByRole('button', { name: /A등급\s*1/ }));
    await waitFor(() => expect(screen.queryByText('이상치 재고 상품')).not.toBeInTheDocument());
    expect(screen.getByText('발주 대상 상품')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /미분류\s*1/ }));
    await waitFor(() => expect(screen.queryByText('발주 대상 상품')).not.toBeInTheDocument());
    expect(screen.getByText('이상치 재고 상품')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /이상치\s*1/ }));
    await waitFor(() => expect(screen.queryByText('발주 대상 상품')).not.toBeInTheDocument());
    expect(screen.getByText('이상치 재고 상품')).toBeInTheDocument();
  });

  it('filters linked SKU rows by lifecycle and risk without treating loss as C', async () => {
    productSalesApi.fetch.mockResolvedValueOnce(abcSummary());
    renderProductOutflow();

    expect(await screen.findByText('신상품 SKU')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /신상품\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /예비 등급\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /손실\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /데이터 확인\s*1/ })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '매출총이익' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '기여도' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /신상품\s*1/ }));
    await waitFor(() => expect(screen.queryByText('공식 C SKU')).not.toBeInTheDocument());
    expect(screen.getByText('신상품 SKU')).toBeInTheDocument();
    expect(screen.queryByText('손실 SKU')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /손실\s*1/ }));
    await waitFor(() => expect(screen.queryByText('신상품 SKU')).not.toBeInTheDocument());
    expect(screen.getByText('손실 SKU')).toBeInTheDocument();
    expect(screen.queryByText('공식 C SKU')).not.toBeInTheDocument();
  });
});

function abcSummary() {
  const calculatedAt = '2026-08-01T00:00:00.000Z';
  return {
    range: { from: '2026-05', to: '2026-06' },
    months: ['2026-05', '2026-06'],
    completeMonths: ['2026-05', '2026-06'],
    products: [
      outflowRow('official-a', '공식 A SKU', 'A', abcEvaluation({ abcGrade: 'A' })),
      outflowRow('official-c', '공식 C SKU', 'C', abcEvaluation({ abcGrade: 'C' })),
      outflowRow('new', '신상품 SKU', null, abcEvaluation({ lifecycleStage: 'NEW', confidence: 'LOW', observedCompleteMonths: 2, riskFlags: ['LIMITED_HISTORY'] })),
      outflowRow('provisional', '예비 등급 SKU', null, abcEvaluation({ lifecycleStage: 'PROVISIONAL', confidence: 'LOW', observedCompleteMonths: 4, provisionalGrade: 'B', riskFlags: ['LIMITED_HISTORY'] })),
      outflowRow('loss', '손실 SKU', null, abcEvaluation({ riskFlags: ['LOSS'], grossProfit: -1 })),
      outflowRow('zero', '가치 0 SKU', null, abcEvaluation({ riskFlags: ['ZERO_VALUE'], grossProfit: 0 })),
      outflowRow('missing-cost', '원가 누락 SKU', null, abcEvaluation({ eligibilityReason: 'MISSING_COST', grossCost: null, grossProfit: null })),
      outflowRow('unclassified', '미분류 SKU', null, null),
    ],
    productCount: 8,
    totalQty: 16,
    lastCapturedAt: calculatedAt,
    hasData: true,
    hasStock: true,
    stockCapturedAt: calculatedAt,
    stockGeneration: '13',
    inventoryResolutionCounts: { matchedSalesRows: 8, mappingRequiredSalesRows: 0, matchedSkus: 8, unlinkedSkus: 0 },
    reorderCount: 0,
    deadStockCount: 0,
    anomalyCount: 0,
    abcCounts: { A: 1, B: 0, C: 1 },
    abcLifecycleCounts: { NEW: 1, PROVISIONAL: 1, ESTABLISHED: 5 },
    abcRiskCounts: { loss: 1, zeroValue: 1, dataQuality: 1 },
    classifiedProductCount: 2,
    unclassifiedProductCount: 1,
    leadTimeMonths: 1,
  };
}

function outflowRow(
  suffix: string,
  productName: string,
  abcGrade: 'A' | 'B' | 'C' | null,
  abcEvaluationValue: ReturnType<typeof abcEvaluation> | null,
) {
  return {
    productCode: `SKU-${suffix}`,
    optionCode: '',
    productName,
    optionName: null,
    providerName: '공급처',
    salePrice: 1_000,
    buyPrice: 500,
    barcode: suffix,
    monthly: [{ yearMonth: '2026-05', orderQty: 1 }, { yearMonth: '2026-06', orderQty: 1 }],
    qty1m: 1,
    qty2m: 2,
    avg2m: 1,
    totalQty: 2,
    trend: 'flat',
    deadStock: false,
    deadStockReason: null,
    seasonTag: null,
    anomaly: false,
    anomalyReason: null,
    inventoryResolution: {
      status: 'matched',
      sellpiaInventorySkuId: `inventory-${suffix}`,
      currentStock: 10,
      activeCommitmentQuantity: 0,
      availableStock: 10,
      salesRowCount: 1,
      destinations: [{
        masterProductId: `master-${suffix}`,
        masterProductCode: `MP-${suffix}`,
        masterProductName: `${productName} 운영 상품`,
        productVariantId: `variant-${suffix}`,
        productVariantCode: `PV-${suffix}`,
        productVariantName: '기본 옵션',
        unitsPerVariant: 1,
        abcGrade,
        abcEvaluation: abcEvaluationValue,
        displayImage: null,
      }],
    },
    monthsOfAvailableStockLeft: 10,
    reorderPoint: 0,
    needsReorder: false,
  };
}

function abcEvaluation(overrides = {}) {
  return {
    abcGrade: null,
    provisionalGrade: null,
    lifecycleStage: 'ESTABLISHED',
    confidence: 'HIGH',
    eligibilityReason: 'ELIGIBLE',
    riskFlags: [],
    observedCompleteMonths: 12,
    observationStartMonth: '2025-08',
    periodMetricValue: 100,
    rankingValue: 100,
    grossRevenue: 200,
    grossCost: 100,
    grossProfit: 100,
    grossMarginRate: 50,
    contributionRate: 70,
    cumulativeContributionRate: 70,
    calculatedAt: '2026-08-01T00:00:00.000Z',
    sourceCapturedAt: '2026-07-31T00:00:00.000Z',
    ...overrides,
  };
}
