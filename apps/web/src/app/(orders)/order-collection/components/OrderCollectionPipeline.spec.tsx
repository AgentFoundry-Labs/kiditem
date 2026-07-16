import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrderCollectionPipeline } from './OrderCollectionPipeline';

describe('OrderCollectionPipeline', () => {
  it('preserves the c9 five-stage pipeline labels', () => {
    render(
      <OrderCollectionPipeline
        summary={{
          todayOrders: 4,
          waiting: 2,
          sent: 0,
          transmissionRequested: 2,
          inventoryPending: 2,
          trackingSent: 0,
          done: 0,
        }}
      />,
    );

    for (const label of ['오늘 주문', '셀피아 전송 대기', '셀피아 전송', '셀피아 송장 전송', '완료']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText('전송 요청됨')).not.toBeInTheDocument();
    expect(screen.queryByText('재고 반영 대기')).not.toBeInTheDocument();
  });
});
