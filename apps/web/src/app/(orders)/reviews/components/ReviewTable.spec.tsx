import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewTable } from './ReviewTable';

describe('ReviewTable', () => {
  it('shows an unmeasured order count instead of fabricating zero', () => {
    render(
      <ReviewTable
        items={[{
          listingId: 'listing-1',
          productId: 'product-1',
          productName: '테스트 상품',
          sku: null,
          organization: '테스트 회사',
          grade: 'A',
          totalReviews: 7,
          avgRating: 4.5,
          recentReviews: 2,
          orderCount: null,
          lastReviewAt: null,
        }]}
        loading={false}
        activeFilter="all"
        page={1}
        total={1}
        PAGE_SIZE={50}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('주문 수 미측정')).toHaveTextContent('미측정');
  });
});
