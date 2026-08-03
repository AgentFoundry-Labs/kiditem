import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChannelOptionInventoryPanel from './ChannelOptionInventoryPanel';

const inventoryDialog = vi.hoisted(() => vi.fn());

vi.mock('./ChannelOptionInventoryDialog', () => ({
  ChannelOptionInventoryDialog: (props: { option: { id: string } }) => {
    inventoryDialog(props);
    return <div role="dialog">재고 구성 편집</div>;
  },
}));

const channelListings = [{
  id: '11111111-1111-4111-8111-111111111111',
  channel: 'coupang',
  channelAccountName: '쿠팡 본계정',
  externalId: 'listing-1',
  displayName: '동물 블록',
  saleStatus: '판매중',
  options: [{
    id: '22222222-2222-4222-8222-222222222222',
    externalOptionId: 'option-1',
    itemName: '10개 묶음',
    sellerSku: 'PACK-10',
    capacity: 8,
    inventoryComponents: [{
      id: '33333333-3333-4333-8333-333333333333',
      sellpiaInventorySkuId: '44444444-4444-4444-8444-444444444444',
      code: 'SP-100',
      name: '동물 블록 낱개',
      optionName: null,
      barcode: null,
      currentStock: 85,
      activeCommitmentQuantity: 0,
      availableStock: 85,
      isActive: true,
      quantity: 10,
    }],
  }, {
    id: '55555555-5555-4555-8555-555555555555',
    externalOptionId: 'option-2',
    itemName: '미연결 옵션',
    sellerSku: 'UNLINKED',
    capacity: null,
    inventoryComponents: [],
  }],
}];

describe('<ChannelOptionInventoryPanel />', () => {
  it('shows direct Sellpia consumption and capacity for every channel option', () => {
    render(<ChannelOptionInventoryPanel channelListings={channelListings} />);

    expect(screen.getByRole('heading', { name: '채널 판매 옵션 · 재고 구성' })).toBeInTheDocument();
    expect(screen.getByText('SP-100 · 동물 블록 낱개')).toBeInTheDocument();
    expect(screen.getByText('가용 85 · 차감 10')).toBeInTheDocument();
    expect(screen.getByText('판매 가능 8개')).toBeInTheDocument();
    expect(screen.getByText('재고 연결 필요')).toBeInTheDocument();
    expect(screen.getByText('판매 가능 미확정')).toBeInTheDocument();
  });

  it('opens the editor for the exact channel listing option', () => {
    render(<ChannelOptionInventoryPanel channelListings={channelListings} />);

    fireEvent.click(screen.getAllByRole('button', { name: '재고 구성 편집' })[0]!);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(inventoryDialog).toHaveBeenCalledWith(expect.objectContaining({
      option: expect.objectContaining({ id: channelListings[0]!.options[0]!.id }),
    }));
  });
});
