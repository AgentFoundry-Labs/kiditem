import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReturnsTable } from './ReturnsTables';

describe('ReturnsTable inventory boundary', () => {
  it('does not create a KidItem inventory mutation draft from a return row', () => {
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

    expect(screen.queryByRole('link', { name: '재고 처리 초안' })).not.toBeInTheDocument();
    expect(screen.queryByText(/재고 처리 초안/)).not.toBeInTheDocument();
  });
});
