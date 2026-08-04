import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SellpiaProductDestination } from '@kiditem/shared/dashboard';
import { productAbcEvaluation } from '@/test/fixtures/product-abc';
import {
  ProductOutflowDestinations,
} from './ProductOutflowDestinations';

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

  it('shows the automatic evaluation state rather than a lifecycle label', () => {
    render(<ProductOutflowDestinations destinations={[
      destination('observing', '관찰 상품', '기본', null, null, productAbcEvaluation({
        abcGrade: null,
        calculationStatus: 'INSUFFICIENT_EVIDENCE',
        formula: null,
        rawScore: null,
        adjustedScore: null,
        reliability: null,
        weightedContributionProfit: null,
      })),
    ]} />);

    expect(screen.getByRole('link', { name: '관찰 상품 · 기본' }))
      .toHaveAttribute('title', expect.stringContaining('INSUFFICIENT_EVIDENCE'));
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
    abcGrade,
    abcEvaluation,
    displayImage: url ? {
      url,
      source: 'channel_catalog',
      channel: 'coupang',
      channelListingId: `listing-${suffix}`,
      externalOptionId: `option-${suffix}`,
    } : null,
  };
}
