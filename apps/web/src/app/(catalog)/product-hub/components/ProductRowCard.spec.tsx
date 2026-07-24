import { fireEvent, render, screen } from '@testing-library/react';
import type { MasterProductOperationsListItem } from '@kiditem/shared/product-operations';
import { ProductRowCard } from './ProductRowCard';

describe('ProductRowCard', () => {
  it('renders the first MasterProduct image and falls back when the CDN image fails', () => {
    render(<ProductRowCard product={product()} />);

    const image = screen.getByRole('img', { name: '테스트 상품 상품 이미지' });
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/master.jpg');

    fireEvent.error(image);

    expect(screen.queryByRole('img', { name: '테스트 상품 상품 이미지' })).not.toBeInTheDocument();
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
    imageUrls: ['https://cdn.example.com/master.jpg'],
    abcGrade: 'A',
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
