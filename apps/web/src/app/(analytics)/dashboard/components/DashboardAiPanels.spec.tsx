import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildAiSuggestions } from '../lib/ai-suggestions';
import { DashboardAiSuggestion } from './DashboardAiSuggestion';
import { DashboardRecentProducts } from './DashboardRecentProducts';
import type { DashboardFindings, DashboardReorderSuggestion } from '@kiditem/shared/dashboard';
import type { MallListingMatrixRow } from '@kiditem/shared/mall-publishing';

function reorder(overrides: Partial<DashboardReorderSuggestion> = {}): DashboardReorderSuggestion {
  return {
    productCode: '3189',
    name: '세계지도 만국기',
    optionName: null,
    masterProductId: '11111111-1111-4111-8111-111111111111',
    imageUrl: null,
    availableStock: 58,
    monthlyOutflow: 1_064,
    daysLeft: 3,
    reorderPoint: 1_596,
    ...overrides,
  };
}

function findings(overrides: Partial<DashboardFindings> = {}): DashboardFindings {
  return {
    productSalesCapturedAt: null,
    reorderProductCount: null,
    salesDecline: { month: null, keyProductLimit: 30, count: null, items: [] },
    reorderSuggestions: null,
    registrationFailures: { count: 0, byChannel: [] },
    ...overrides,
  };
}

function matrixRow(overrides: Partial<MallListingMatrixRow> = {}): MallListingMatrixRow {
  return {
    masterProductId: '22222222-2222-4222-8222-222222222222',
    name: '3500LED글라이더',
    code: 'INV-SELLPIA-1',
    imageUrl: null,
    category: null,
    stock: 440,
    publishedCount: 0,
    cells: [],
    updatedAt: '2026-09-17T14:28:29.148Z',
    ...overrides,
  };
}

describe('DashboardAiSuggestion', () => {
  it('keeps reorder evidence on the server-published stock and monthly outflow values', () => {
    const suggestions = buildAiSuggestions({
      findings: findings({ reorderSuggestions: [reorder()] }),
      stock: undefined,
      unlinkedProducts: null,
    });

    render(<DashboardAiSuggestion suggestions={suggestions} isLoading={false} isError={false} />);

    const card = screen.getByTestId('dashboard-ai-suggestion-reorder:3189');
    expect(card).toHaveAttribute('href', '/product-hub/11111111-1111-4111-8111-111111111111');
    expect(card).toHaveTextContent('현재고 58개 · 월 평균 1,064개 판매');
  });

  it('shows two suggestions per page and describes an unlinked source product honestly', () => {
    const suggestions = buildAiSuggestions({
      findings: findings({
        reorderSuggestions: [
          reorder(),
          reorder({ productCode: '2', name: '투톤슬라임', masterProductId: null, daysLeft: 0 }),
        ],
        salesDecline: { month: '2026-08', keyProductLimit: 30, count: 23, items: [] },
        registrationFailures: { count: 12, byChannel: [] },
      }),
      stock: { outOfStockCount: 879, reorderProductCount: 58 },
      unlinkedProducts: 2_429,
    });

    render(<DashboardAiSuggestion suggestions={suggestions} isLoading={false} isError={false} />);

    expect(screen.getByTestId('dashboard-ai-suggestion-reorder:3189')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-ai-suggestion-unlinked')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음 제안' }));
    const unlinked = screen.getByTestId('dashboard-ai-suggestion-unlinked');
    expect(unlinked).toHaveTextContent('원천 상품 2,429개');
    expect(unlinked).not.toHaveTextContent('판매상품');
    expect(unlinked).not.toHaveTextContent('몰 미등록');
  });

  it('keeps stock and sales findings neutral about their cause and comparison window', () => {
    const suggestions = buildAiSuggestions({
      findings: findings({
        salesDecline: {
          month: '2026-08', keyProductLimit: 30, count: 1,
          items: [{
            productCode: '10473', name: '잔디인형', optionName: null, masterProductId: null, imageUrl: null,
            recentQty: 2, baselineQty: 10, changePercent: -80,
          }],
        },
      }),
      stock: { outOfStockCount: 4, reorderProductCount: null },
      unlinkedProducts: null,
    });

    const stock = suggestions.find((item) => item.key === 'outOfStock')!;
    const decline = suggestions.find((item) => item.key === 'decline')!;
    expect(stock.headline).toContain('품절 상태');
    expect(stock.headline).not.toContain('내려둔');
    expect(stock.evidence).not.toContain('그날부터');
    expect(decline.headline).toContain('기준보다');
    expect(decline.headline).not.toContain('지난달보다');
  });
});

describe('DashboardRecentProducts', () => {
  it('labels the matrix as connection status and keeps unlinked rows explicit', () => {
    render(
      <DashboardRecentProducts
        rows={[matrixRow(), matrixRow({ masterProductId: '33333333-3333-4333-8333-333333333333', publishedCount: 2 })]}
        isLoading={false}
        isError={false}
      />,
    );

    expect(screen.getByRole('region', { name: '상품별 쇼핑몰 연결 현황' })).toBeInTheDocument();
    expect(screen.getByText('몰 연결 없음')).toBeInTheDocument();
    expect(screen.getByText('2개 몰 등록됨')).toBeInTheDocument();
    expect(screen.getAllByText(/INV-SELLPIA-1/)).not.toHaveLength(0);
    expect(screen.queryByText(/판매 중/)).not.toBeInTheDocument();
  });

  it('keeps a matrix read failure distinct from an empty matrix', () => {
    render(<DashboardRecentProducts rows={undefined} isLoading={false} isError />);
    expect(screen.getByText('상품별 쇼핑몰 연결 현황을 읽지 못했습니다.')).toBeInTheDocument();
  });
});
