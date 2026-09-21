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
    expect(screen.getByText(/상품 코드 KID00000001/)).toBeInTheDocument();
  });

  it('shows the canonical KID code in the detail header', () => {
    render(<ProductHeader product={{
      ...product(),
      code: 'KID00000100',
      displayReference: {
        type: 'product_code',
        label: '상품 코드',
        value: 'KID00000100',
      },
    }} onEdit={() => undefined} onBack={() => undefined} />);

    expect(screen.getByRole('heading', { level: 1, name: '상세 테스트 상품' })).toBeInTheDocument();
    expect(screen.getByText(/KID00000100/)).toBeInTheDocument();
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
    code: 'KID00000001',
    displayReference: { type: 'product_code', label: '상품코드', value: 'KID00000001' },
    name: '상세 테스트 상품',
    imageUrls: [],
    displayImageUrls: ['https://cdn.example.com/detail-channel.jpg'],
  } as MasterProductOperationsDetail;
}
