import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildPeriodBasis, enumerateDashboardDates } from '@kiditem/shared/dashboard';
import { productAbcEvaluation } from '@/test/fixtures/product-abc';
import { ProductRowCard } from './ProductRowCard';
import type { MasterProductOperationsListItem } from '@kiditem/shared/product-operations';

describe('ProductRowCard', () => {
  it('renders the calculated channel fallback when raw MasterProduct media is empty', () => {
    render(<ProductRowCard product={product()} />);

    const image = screen.getByRole('img', { name: '테스트 상품 상품 이미지' });
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/channel.jpg');

    fireEvent.error(image);

    expect(screen.queryByRole('img', { name: '테스트 상품 상품 이미지' })).not.toBeInTheDocument();
  });

  it('keeps an operator product code visible in the catalog row', () => {
    render(<ProductRowCard product={product()} />);

    expect(screen.getByText(/상품코드 MASTER-1/)).toBeInTheDocument();
  });

  it('shows the canonical KID code while retaining product context', () => {
    render(<ProductRowCard product={{
      ...product(),
      code: 'KID00000100',
      displayReference: {
        type: 'product_code',
        label: '상품 코드',
        value: 'KID00000100',
      },
    }} />);

    expect(screen.getByText('테스트 상품')).toBeInTheDocument();
    expect(screen.getByText(/상품 코드 KID00000100/)).toBeInTheDocument();
  });

  it('opens the already-loaded ABC evidence through an accessible badge button', () => {
    const onOpenAbcDetail = vi.fn();
    render(<ProductRowCard product={product()} onOpenAbcDetail={onOpenAbcDetail} />);

    fireEvent.click(screen.getByRole('button', { name: '테스트 상품 ABC 근거 보기' }));

    expect(onOpenAbcDetail).toHaveBeenCalledWith(expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111' }));
  });

  it('renders current KST month sales and marks unavailable cost and profit as uncomputable', () => {
    render(<ProductRowCard product={product()} />);

    expect(screen.getByText('35,000원')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByTitle('매출 · KST 2026-09 · 수집 범위 2026-09-01–2026-09-22')).toHaveTextContent('35,000원');
    expect(screen.getByTitle('판매 · KST 2026-09 · 수집 범위 2026-09-01–2026-09-22')).toHaveTextContent('5');
    expect(screen.getAllByText('계산 불가')).toHaveLength(3);
  });

  it('marks monthly sales and revenue as unmeasured when the monthly fact is absent', () => {
    render(<ProductRowCard product={{ ...product(), monthly: null }} />);

    expect(screen.getByTitle('매출 · 월별 수집 미측정')).toHaveTextContent('—');
    expect(screen.getByTitle('판매 · 월별 수집 미측정')).toHaveTextContent('—');
  });

  it('renders measured monthly cost, gross profit, and margin when the API provides them', () => {
    render(<ProductRowCard product={{
      ...product(),
      monthly: {
        ...product().monthly!,
        cost: 20_000,
        grossProfit: 15_000,
        grossMarginRate: 42.9,
      },
    }} />);

    expect(screen.getByText('20,000원')).toBeInTheDocument();
    expect(screen.getByText('15,000원')).toBeInTheDocument();
    expect(screen.getByText('42.9%')).toBeInTheDocument();
  });

  it('keeps real zero monthly sales as zero', () => {
    render(<ProductRowCard product={{
      ...product(),
      monthly: {
        ...product().monthly!,
        revenue: 0,
        soldQuantity: 0,
        cost: 0,
        grossProfit: 0,
        grossMarginRate: null,
      },
    }} />);

    expect(screen.getAllByText('0원')).toHaveLength(3);
    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(screen.getByText('계산 불가')).toBeInTheDocument();
  });

  it('shows the monthly outflow basis', () => {
    render(<ProductRowCard product={{
      ...product(),
      depletion: { ...product().depletion, monthlyOutflow: 42, outflowMonthCount: 2 },
    }} />);

    expect(screen.getByText('42')).toHaveAttribute('title', '완결 2개월 평균');
  });

  it('does not infer a new-product label from current-month sales', () => {
    render(<ProductRowCard product={{
      ...product(),
      depletion: { ...product().depletion, monthlyOutflow: null, outflowMonthCount: 0 },
    }} />);
    expect(screen.queryByText('신상품')).not.toBeInTheDocument();
    expect(screen.getByTitle('완결된 달의 판매 근거가 없어 월 평균을 재지 못했습니다')).toHaveTextContent('—');
  });

  it('hides opaque category references and stock-basis labels from the product list', () => {
    render(<ProductRowCard product={{
      ...product(),
      category: '64681/1937',
      depletion: {
        ...product().depletion,
        coverage: 'shared',
      },
    }} />);

    expect(screen.queryByText('64681/1937')).not.toBeInTheDocument();
    expect(screen.queryByText('공유 SKU 기준')).not.toBeInTheDocument();
    expect(screen.queryByText('직접 판매 기준')).not.toBeInTheDocument();
  });

  it('shows the sales channels that currently list the product', () => {
    render(<ProductRowCard product={{
      ...product(),
      activeChannels: [
        {
          channelAccountId: '00000000-0000-4000-8000-000000000004',
          channel: 'coupang',
          channelAccountName: 'Coupang Wing',
        },
        {
          channelAccountId: '00000000-0000-4000-8000-000000000005',
          channel: 'coupang_rocket',
          channelAccountName: 'Coupang Rocket',
        },
      ],
    }} />);

    expect(screen.getByText(/몰 2곳/)).toBeInTheDocument();
    expect(screen.queryByText('Coupang Wing')).not.toBeInTheDocument();
    expect(screen.queryByText('Coupang Rocket')).not.toBeInTheDocument();
  });

  it('uses selling eligibility instead of inventory activity for the sales badge', () => {
    render(<ProductRowCard product={{ ...product(), isSelling: false }} />);

    expect(screen.getByText('판매중지')).toBeInTheDocument();
    expect(screen.queryByText('판매중')).not.toBeInTheDocument();
  });

  it('renders a missing inventory snapshot as uncollected instead of sold out', () => {
    render(<ProductRowCard product={{
      ...product(),
      inventoryUnits: null,
      inventory: { skuCount: 1, measuredSkuCount: 0 },
    }} />);

    expect(screen.getAllByText('미수집')).not.toHaveLength(0);
    expect(screen.queryByText('품절')).not.toBeInTheDocument();
  });

  it('leaves the partial-period caption to the product list', () => {
    render(<ProductRowCard product={{
      ...product(),
      viewCount: 91,
      cartAddCount: 26,
      metricsFreshness: {
        ...product().metricsFreshness,
        traffic: {
          capturedAt: '2026-09-15T00:00:00.000Z',
          basis: buildPeriodBasis({
            from: '2026-09-01',
            to: '2026-09-14',
            includedDates: enumerateDashboardDates('2026-09-01', '2026-09-13'),
            sources: ['wing_traffic'],
          }),
        },
      },
    }} />);

    expect(screen.queryByText(/부분/)).not.toBeInTheDocument();
  });
});

function product(): MasterProductOperationsListItem {
  const evaluation = productAbcEvaluation();
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'MASTER-1',
    displayReference: { type: 'product_code', label: '상품코드', value: 'MASTER-1' },
    name: '테스트 상품',
    description: null,
    category: '완구',
    brand: 'KidItem',
    tags: [],
    imageUrls: [],
    displayImageUrls: ['https://cdn.example.com/channel.jpg'],
    abcGrade: 'A',
    abcEvaluation: evaluation,
    abc: {
      abcGrade: 'A',
      evaluation,
      formulaRevision: 2,
      publicationRevision: 4,
      officialCutoffDate: '2026-07-31',
      publishedAt: '2026-08-01T00:00:00.000Z',
      actualCutoffDate: '2026-08-31',
      sources: {
        sellpia: abcSource(),
        advertising: abcSource(),
        mapping: { valid: true, currentMappingGeneration: '7', evidenceMappingGeneration: '7' },
      },
    },
    contribution: {
      masterProductId: '11111111-1111-4111-8111-111111111111',
      revenue: 220_000,
      operatingProfit: 120_000,
      salesContribution: 1,
      positiveOperatingProfitContribution: 1,
      lossImpact: null,
      salesRank: 1,
      positiveOperatingProfitRank: 1,
      lossRank: null,
      cumulativeSalesContribution: 1,
      cumulativePositiveOperatingProfitContribution: 1,
      cumulativeLossImpact: null,
      metricCompleteness: { sales: true, operatingProfit: true },
    },
    adBudgetLimit: null,
    isActive: true,
    isSelling: true,
    updatedAt: '2026-07-24T00:00:00.000Z',
    depletion: {
      coverage: 'no_direct_sales',
      needsReorder: false,
      reorderSkuCount: 0,
      monthlyOutflow: null,
      outflowMonthCount: 0,
      minMonthsOfAvailableStockLeft: null,
    },
    channelOptionSummary: { total: 1, active: 1, configured: 0, warning: 1 },
    inventoryUnits: 0,
    inventory: { skuCount: 0, measuredSkuCount: 0 },
    channelCount: 1,
    channelStatus: 'listed',
    activeChannels: [{
      channelAccountId: '00000000-0000-4000-8000-000000000004',
      channel: 'coupang',
      channelAccountName: 'Coupang Wing',
    }],
    traffic: 11,
    visitorCount: 11,
    viewCount: 22,
    cartAddCount: 3,
    orderCount: 4,
    salesQuantity: 5,
    salesAmount: 35_000,
    adSpend: 3_500,
    adSpendRate: 10,
    monthly: {
      yearMonth: '2026-09',
      revenue: 35_000,
      soldQuantity: 5,
      cost: null,
      grossProfit: null,
      grossMarginRate: null,
      coverageStartDate: '2026-09-01',
      coverageEndDate: '2026-09-22',
    },
    metricsFreshness: {
      orders: { ready: false, coverageStartDate: null, coverageEndDate: null, capturedAt: null },
      traffic: {
        capturedAt: '2026-08-01T00:00:00.000Z',
        basis: buildPeriodBasis({
          from: '2026-07-01',
          to: '2026-07-31',
          includedDates: enumerateDashboardDates('2026-07-01', '2026-07-31'),
          sources: ['wing_traffic'],
        }),
      },
      advertising: {
        ready: true,
        coverageStartDate: '2026-07-01',
        coverageEndDate: '2026-07-31',
        capturedAt: '2026-08-01T00:00:00.000Z',
      },
    },
  };
}

function abcSource() {
  return {
    ready: true,
    requiredCutoff: '2026-08-31',
    actualCutoff: '2026-08-31',
    latestAttempt: { state: 'COMPLETE' as const },
    latestComplete: { actualCutoff: '2026-08-31' },
  };
}
