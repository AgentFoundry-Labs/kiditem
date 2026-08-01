import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ProductRowCard } from './ProductRowCard';
import type { MasterProductOperationsListItem } from '@kiditem/shared/product-operations';
import { productAbcEvaluation } from '@/test/fixtures/product-abc';

describe('ProductRowCard', () => {
  it('renders the calculated channel fallback when raw MasterProduct media is empty', () => {
    render(<ProductRowCard product={product()} />);

    const image = screen.getByRole('img', { name: '테스트 상품 상품 이미지' });
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/channel.jpg');

    fireEvent.error(image);

    expect(screen.queryByRole('img', { name: '테스트 상품 상품 이미지' })).not.toBeInTheDocument();
  });

  it('opens the already-loaded ABC evidence through an accessible badge button', () => {
    const onOpenAbcDetail = vi.fn();
    render(<ProductRowCard product={product()} onOpenAbcDetail={onOpenAbcDetail} />);

    fireEvent.click(screen.getByRole('button', { name: '테스트 상품 ABC 근거 보기' }));

    expect(onOpenAbcDetail).toHaveBeenCalledWith(expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111' }));
  });
});

function product(): MasterProductOperationsListItem {
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
    abcEvaluation: productAbcEvaluation(),
    profitTag: null,
    adTier: null,
    adBudgetLimit: null,
    healthScore: null,
    healthUpdatedAt: null,
    isActive: true,
    updatedAt: '2026-07-24T00:00:00.000Z',
    depletion: {
      coverage: 'no_direct_sales',
      needsReorder: false,
      reorderSkuCount: 0,
      minMonthsOfAvailableStockLeft: null,
    },
    variantSummary: { total: 1, active: 1, configured: 0, warning: 1 },
    inventoryUnits: 0,
    inventoryStatus: 'configuration_required',
    channelCount: 1,
    channelStatus: 'listed',
    traffic: null,
    orderCount: null,
    salesAmount: null,
    adSpend: null,
    profit: null,
  };
}
