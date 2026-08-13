import { render, screen } from '@testing-library/react';
import type { MasterProductOperationsDetail } from '@kiditem/shared/product-operations';
import ProductInfoCards from './ProductInfoCards';

describe('ProductInfoCards', () => {
  it('hides a system-owned Sellpia product code without hiding its operating facts', () => {
    render(<ProductInfoCards product={product()} onOpenAbcDetail={() => undefined} />);

    expect(screen.getByText('카테고리')).toBeInTheDocument();
    expect(screen.getByText('완구')).toBeInTheDocument();
    expect(screen.getByText('브랜드')).toBeInTheDocument();
    expect(screen.getByText('KidItem')).toBeInTheDocument();
    expect(screen.queryByText('상품 코드')).not.toBeInTheDocument();
    expect(screen.queryByText(/INV-SELLPIA-/)).not.toBeInTheDocument();
  });
});

function product(): MasterProductOperationsDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'INV-SELLPIA-100',
    displayReference: {
      type: 'product_code',
      label: '상품 코드',
      value: 'INV-SELLPIA-100',
    },
    name: '상세 테스트 상품',
    description: null,
    category: '완구',
    brand: 'KidItem',
    tags: [],
    imageUrls: [],
    displayImageUrls: [],
    abcGrade: null,
    abcEvaluation: null,
    profitTag: null,
    adTier: null,
    adBudgetLimit: null,
    healthScore: null,
    healthUpdatedAt: null,
    isActive: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    inventoryStatus: 'sellable',
    inventoryUnits: 10,
    channelListings: [],
  };
}
