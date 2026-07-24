import { fireEvent, render, screen } from '@testing-library/react';
import type { MasterProductOperationsDetail } from '@kiditem/shared/product-operations';
import ProductHeader from './ProductHeader';

describe('ProductHeader', () => {
  it('uses the MasterProduct image on the detail header and handles a broken URL', () => {
    render(<ProductHeader product={product()} onEdit={() => undefined} />);

    const image = screen.getByRole('img', { name: '상세 테스트 상품 상품 이미지' });
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/detail-master.jpg');

    fireEvent.error(image);

    expect(screen.queryByRole('img', { name: '상세 테스트 상품 상품 이미지' })).not.toBeInTheDocument();
  });
});

function product(): MasterProductOperationsDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'MASTER-1',
    displayReference: { type: 'product_code', label: '상품코드', value: 'MASTER-1' },
    name: '상세 테스트 상품',
    category: '완구',
    brand: 'KidItem',
    imageUrls: ['https://cdn.example.com/detail-master.jpg'],
    isActive: true,
  } as MasterProductOperationsDetail;
}
