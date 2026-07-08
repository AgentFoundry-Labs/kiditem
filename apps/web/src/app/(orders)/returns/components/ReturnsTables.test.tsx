import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReturnsTable } from './ReturnsTables';

describe('ReturnsTable Rocket stock link', () => {
  it('links a return row to the Rocket return restock draft', () => {
    render(
      <ReturnsTable
        returns={[{
          id: 'return-1',
          receiptId: 12345,
          orderId: 'ORDER-1',
          requesterName: '고객',
          receiptStatus: 'RC',
          receiptType: 'RETURN',
          faultByType: '',
          cancelReason: 'CHANGE_MIND',
          cancelReasonCategory1: '',
          cancelReasonCategory2: '',
          reasonCodeText: '',
          enclosePrice: 0,
          requestedAt: '2026-06-29T00:00:00.000Z',
          completedAt: null,
          createdAt: '2026-06-29T00:00:00.000Z',
          lineItems: [{
            id: 'item-1',
            vendorItemName: '상품',
            sellerProductName: '상품',
            purchaseCount: 1,
            cancelCount: 1,
          }],
        }]}
        processing={null}
        onApprove={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: '재고 처리 초안' })).toHaveAttribute(
      'href',
      '/inventory-hub?tab=rocket-events&eventType=return_restock&quantity=1&sourceRef=return-12345-line-item-1&note=%EC%BF%A0%ED%8C%A1+%EB%B0%98%ED%92%88+ORDER-1+%EC%83%81%ED%92%88',
    );
  });
});
