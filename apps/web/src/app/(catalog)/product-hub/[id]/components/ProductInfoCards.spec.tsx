import { render, screen } from '@testing-library/react';
import ProductInfoCards from './ProductInfoCards';
import type { MasterProductOperationsDetail } from '@kiditem/shared/product-operations';

describe('ProductInfoCards', () => {
  it('shows the product code without retired source metadata controls', () => {
    render(<ProductInfoCards product={product()} onOpenAbcDetail={() => undefined} />);
    expect(screen.getByText('상품 코드')).toBeInTheDocument();
    expect(screen.getByText('KID00000100')).toBeInTheDocument();
    for (const label of ['카테고리', '브랜드', '광고 설정', '광고 예산 한도', '손익 태그']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

});

function product(): MasterProductOperationsDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'KID00000100',
    displayReference: {
      type: 'product_code',
      label: '상품 코드',
      value: 'KID00000100',
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
    adBudgetLimit: null,
    isActive: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    inventory: { skuCount: 1, measuredSkuCount: 1 },
    inventoryUnits: 10,
    channelListings: [],
  };
}
