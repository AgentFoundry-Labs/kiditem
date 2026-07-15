import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrderCollectionPipeline } from './OrderCollectionPipeline';

describe('OrderCollectionPipeline', () => {
  it('labels extension submission as a request and explains inventory verification', () => {
    render(
      <OrderCollectionPipeline
        summary={{
          todayOrders: 4,
          waiting: 2,
          transmissionRequested: 2,
          trackingSent: 0,
          done: 0,
        }}
      />,
    );

    expect(screen.getByText('셀피아 전송 요청됨')).toBeInTheDocument();
    expect(
      screen.getByText(
        '전송 요청은 셀피아 접수 완료를 의미하지 않습니다. 다음 자동 셀피아 재고 최신화가 실제 재고 반영을 검증합니다.',
      ),
    ).toBeInTheDocument();
  });
});
