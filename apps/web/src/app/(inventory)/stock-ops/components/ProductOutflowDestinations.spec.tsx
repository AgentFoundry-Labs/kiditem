import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { productAbcEvaluation, productAbcReadModel } from '@/test/fixtures/product-abc';
import {
  ProductOutflowDestinations,
} from './ProductOutflowDestinations';
import type { SellpiaProductDestination } from '@kiditem/shared/dashboard';

describe('ProductOutflowDestinations', () => {
  it('keeps a separate image beside each rendered destination and limits the dense table cell to two', () => {
    render(<ProductOutflowDestinations destinations={[
      destination('one', '상품 하나', '빨강', 'https://cdn.example/one.jpg', 'A'),
      destination('two', '상품 둘', '파랑', 'https://cdn.example/two.jpg', 'B'),
      destination('three', '상품 셋', '초록', null, null),
    ]} />);

    expect(screen.getByRole('img', { name: '상품 하나 · 빨강' })).toHaveAttribute('src', 'https://cdn.example/one.jpg');
    expect(screen.getByRole('img', { name: '상품 둘 · 파랑' })).toHaveAttribute('src', 'https://cdn.example/two.jpg');
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
    expect(screen.queryByText('미분류')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('C등급')).not.toBeInTheDocument();
  });

  it('shows the retained grade with live source attention and the actual data cutoff', () => {
    const item = destination('stale', '기존 등급 상품', '기본', null, 'A');
    item.abc = productAbcReadModel({
      sources: { ...item.abc.sources, sellpia: { ...item.abc.sources.sellpia, ready: false, latestAttemptState: 'FAILED' } },
    });
    render(<ProductOutflowDestinations destinations={[item]} />);
    const link = screen.getByRole('link', { name: '기존 등급 상품 · 기본' });
    // Stock-ops titles use the one Product Hub label map.
    expect(link).toHaveAttribute('title', expect.stringContaining('Sellpia 원천 갱신 필요'));
    expect(link).toHaveAttribute('title', expect.stringContaining('데이터 기준 2026-07-31'));
    expect(link).toHaveAttribute('href', '/product-hub/master-stale');
  });

  it('has an accessible empty state', () => {
    render(<ProductOutflowDestinations destinations={[]} />);
    expect(screen.getByText('연결된 채널 상품 없음')).toBeInTheDocument();
  });
});

function destination(
  suffix: string,
  masterProductName: string,
  optionName: string,
  url: string | null,
  abcGrade: 'A' | 'B' | 'C' | null,
  abcEvaluation = abcGrade
    ? productAbcEvaluation({ abcGrade })
    : null,
): SellpiaProductDestination {
  return {
    masterProductId: `master-${suffix}`,
    masterProductCode: `MP-${suffix}`,
    masterProductName,
    channelListingOptionId: `option-${suffix}`,
    channelListingId: `listing-${suffix}`,
    channel: 'coupang',
    externalOptionId: `external-option-${suffix}`,
    optionName,
    unitsPerSale: 1,
    abc: productAbcReadModel({ evaluation: abcEvaluation }),
    displayImage: url ? {
      url,
      source: 'channel_catalog',
      channel: 'coupang',
      channelListingId: `listing-${suffix}`,
      externalOptionId: `option-${suffix}`,
    } : null,
  };
}
