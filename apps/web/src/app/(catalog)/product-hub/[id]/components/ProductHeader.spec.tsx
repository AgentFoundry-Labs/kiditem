import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ProductHeader from './ProductHeader';
import type { MasterProductOperationsDetail } from '@kiditem/shared/product-operations';

describe('ProductHeader', () => {
  it('uses the calculated channel fallback on the detail header when raw media is empty', () => {
    render(<ProductHeader product={product()} onEdit={() => undefined} onBack={() => undefined} />);

    const image = screen.getByRole('img', { name: '상세 테스트 상품 상품 이미지' });
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/detail-channel.jpg');

    fireEvent.error(image);

    expect(screen.queryByRole('img', { name: '상세 테스트 상품 상품 이미지' })).not.toBeInTheDocument();
    expect(screen.getByText(/상품코드 MASTER-1/)).toBeInTheDocument();
  });

  it('hides a system-owned Sellpia code from the detail header', () => {
    render(<ProductHeader product={{
      ...product(),
      code: 'INV-SELLPIA-100',
      displayReference: {
        type: 'product_code',
        label: '상품 코드',
        value: 'INV-SELLPIA-100',
      },
    }} onEdit={() => undefined} onBack={() => undefined} />);

    expect(screen.getByRole('heading', { level: 1, name: '상세 테스트 상품' })).toBeInTheDocument();
    expect(screen.queryByText(/INV-SELLPIA-/)).not.toBeInTheDocument();
  });

  it('delegates returning to the route-owned navigation callback', () => {
    const onBack = vi.fn();
    render(<ProductHeader product={product()} onEdit={() => undefined} onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));

    expect(onBack).toHaveBeenCalledTimes(1);
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
    imageUrls: [],
    displayImageUrls: ['https://cdn.example.com/detail-channel.jpg'],
    isActive: true,
  } as MasterProductOperationsDetail;
}
