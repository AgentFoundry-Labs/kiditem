import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductOutflowDestinations } from './ProductOutflowDestinations';

describe('ProductOutflowDestinations', () => {
  it('keeps a separate image beside each rendered destination and limits the dense table cell to two', () => {
    render(<ProductOutflowDestinations destinations={[
      destination('one', '상품 하나', '빨강', 'https://cdn.example/one.jpg', 'A'),
      destination('two', '상품 둘', '파랑', 'https://cdn.example/two.jpg', 'B'),
      destination('three', '상품 셋', '초록', null, null),
    ]} />);

    expect(screen.getByRole('img', { name: '상품 하나 · 빨강' })).toHaveAttribute('src', 'https://cdn.example/one.jpg');
    expect(screen.getByRole('img', { name: '상품 둘 · 파랑' })).toHaveAttribute('src', 'https://cdn.example/two.jpg');
    expect(screen.getByRole('link', { name: '상품 하나 · 빨강' })).toHaveAttribute('href', '/product-hub/master-one');
    expect(screen.getByRole('link', { name: '상품 둘 · 파랑' })).toHaveAttribute('href', '/product-hub/master-two');
    expect(screen.getByText('A등급')).toBeInTheDocument();
    expect(screen.getByText('B등급')).toBeInTheDocument();
    expect(screen.queryByText('상품 셋')).not.toBeInTheDocument();
    expect(screen.getByText('외 1개')).toBeInTheDocument();
  });

  it('keeps accessible fallback text when no image is available or an image fails', () => {
    render(<ProductOutflowDestinations destinations={[
      destination('none', '이미지 없음 상품', '기본', null, null),
      destination('broken', '깨진 이미지 상품', '대형', 'https://cdn.example/broken.jpg', 'C'),
    ]} />);

    expect(screen.getByText('이미지 없음')).toBeInTheDocument();
    fireEvent.error(screen.getByRole('img', { name: '깨진 이미지 상품 · 대형' }));
    expect(screen.getAllByText('이미지 없음')).toHaveLength(2);
    expect(screen.getByText('미분류')).toBeInTheDocument();
    expect(screen.getByText('C등급')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '깨진 이미지 상품 · 대형' })).not.toBeInTheDocument();
  });

  it('has an accessible empty state', () => {
    render(<ProductOutflowDestinations destinations={[]} />);
    expect(screen.getByText('운영 상품 미연결')).toBeInTheDocument();
  });
});

function destination(
  suffix: string,
  masterProductName: string,
  productVariantName: string,
  url: string | null,
  abcGrade: 'A' | 'B' | 'C' | null,
) {
  return {
    masterProductId: `master-${suffix}`,
    masterProductCode: `MP-${suffix}`,
    masterProductName,
    productVariantId: `variant-${suffix}`,
    productVariantCode: `PV-${suffix}`,
    productVariantName,
    unitsPerVariant: 1,
    abcGrade,
    displayImage: url ? {
      url,
      source: 'coupang_catalog' as const,
      channelListingId: `listing-${suffix}`,
      externalOptionId: `option-${suffix}`,
    } : null,
  };
}
