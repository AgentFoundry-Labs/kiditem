import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderMatching from './OrderMatching';

const { refetchMock } = vi.hoisted(() => ({ refetchMock: vi.fn() }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      items: [{
        id: '11111111-1111-4111-8111-111111111111',
        channelAccountId: '22222222-2222-4222-8222-222222222222',
        channel: 'coupang',
        externalOrderId: 'shipment-1',
        externalNumber: 'ORDER-20260713-1',
        displayOrderNumber: 'ORDER-20260713-1',
        shipmentBoxId: null,
        status: 'ACCEPT',
        customerName: '홍길동',
        receiverName: '홍길동',
        receiverAddr: null,
        memo: null,
        orderedAt: '2026-07-13T00:00:00.000Z',
        shippedAt: null,
        deliveredAt: null,
        trackingNumber: null,
        shippingCompany: null,
        totalPrice: 23800,
        totalQuantity: 3,
        lineItemCount: 2,
        primaryProductName: '우파루팡 반짝슈가 말랑이',
        primaryOptionName: '핑크',
        lineItems: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            productName: '우파루팡 반짝슈가 말랑이',
            optionName: '핑크',
            sku: 'WING-PINK',
            quantity: 2,
            unitPrice: 7900,
            totalPrice: 15800,
            status: 'ACCEPT',
            externalLineId: 'line-1',
          },
          {
            id: '44444444-4444-4444-8444-444444444444',
            productName: '자석 다트게임',
            optionName: null,
            sku: null,
            quantity: 1,
            unitPrice: 8000,
            totalPrice: 8000,
            status: 'ACCEPT',
            externalLineId: 'line-2',
          },
        ],
      }],
      total: 1,
      page: 1,
      limit: 20,
      deliveryCompanies: [],
    },
    isLoading: false,
    refetch: refetchMock,
  }),
}));

describe('OrderMatching', () => {
  beforeEach(() => refetchMock.mockReset());

  it('restores the full read-only order-line matching screen', () => {
    render(<OrderMatching />);

    expect(screen.getByRole('heading', { level: 2, name: /주문상품 매칭 확인/ })).toBeInTheDocument();
    expect(screen.getAllByText('ORDER-20260713-1')).toHaveLength(2);
    expect(screen.getByText('우파루팡 반짝슈가 말랑이')).toBeInTheDocument();
    expect(screen.getByText('핑크')).toBeInTheDocument();
    expect(screen.getByText('WING-PINK')).toBeInTheDocument();
    expect(screen.getByText('자석 다트게임')).toBeInTheDocument();
    expect(screen.getByText('2개')).toBeInTheDocument();
  });

  it('searches safely across order numbers and nullable line-item fields', async () => {
    const user = userEvent.setup();
    render(<OrderMatching />);

    const search = screen.getByPlaceholderText('주문상품명, 옵션, SKU 또는 주문번호로 검색...');
    await user.type(search, '자석');
    expect(screen.getByText('자석 다트게임')).toBeInTheDocument();
    expect(screen.queryByText('우파루팡 반짝슈가 말랑이')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'order-20260713');
    expect(screen.getAllByText('ORDER-20260713-1')).toHaveLength(2);
  });

  it('keeps matching mutations in the current product-matching owner', () => {
    render(<OrderMatching />);

    expect(screen.getByRole('link', { name: '채널 상품 매칭 관리' })).toHaveAttribute(
      'href',
      '/product-hub/matching',
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^매칭$/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/매칭 완료/)).not.toBeInTheDocument();
  });
});
