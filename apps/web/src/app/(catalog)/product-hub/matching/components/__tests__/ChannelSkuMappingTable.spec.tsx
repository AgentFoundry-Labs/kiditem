import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChannelSkuMappingTable } from '../ChannelSkuMappingTable';
import { MappingStatusTabs } from '../MappingStatusTabs';
import type { ChannelSkuMappingListItem } from '@kiditem/shared/channel-sku-matching';

const item: ChannelSkuMappingListItem = {
  channelAccount: {
    id: '11111111-1111-4111-8111-111111111111',
    channel: 'coupang',
    name: '쿠팡 Wing',
  },
  product: {
    id: '22222222-2222-4222-8222-222222222222',
    externalProductId: 'product-10',
    registeredName: '등록 상품명',
    displayName: '노출 상품명',
    status: '판매중',
  },
  sku: {
    id: '33333333-3333-4333-8333-333333333333',
    externalSkuId: 'sku-20',
    sellerSku: 'seller-30',
    optionName: '핑크',
    barcode: '8801234567890',
    modelNumber: 'MODEL-40',
    salePrice: null,
    status: '판매중',
    mappingStatus: 'matched',
    sellableStock: 2,
    updatedAt: '2026-07-11T00:00:00.000Z',
  },
  components: [
    {
      inventorySkuId: '44444444-4444-4444-8444-444444444444',
      sellpiaProductCode: 'SP-001',
      name: '셀피아 상품',
      optionName: '분홍',
      barcode: '8801234567890',
      currentStock: 8,
      purchasePrice: 1500,
      quantity: 4,
      mappingSource: 'manual',
      componentCapacity: 2,
      isBottleneck: true,
    },
  ],
};

describe('MappingStatusTabs', () => {
  it('renders all fixed statuses, counts, and sends the selected status', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MappingStatusTabs
        active="unmatched"
        counts={{ all: 10, unmatched: 6, needsReview: 3, matched: 1 }}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('button', { name: '전체 10' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '미매칭 6' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '확인 필요 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '매칭 완료 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '확인 필요 3' }));
    expect(onChange).toHaveBeenCalledWith('needs_review');
  });
});

describe('ChannelSkuMappingTable', () => {
  it('renders the complete channel/Sellpia read model and edit action', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <ChannelSkuMappingTable
        items={[item]}
        total={1}
        page={1}
        limit={50}
        loading={false}
        emptyMessage="비어 있음"
        onPageChange={vi.fn()}
        onEdit={onEdit}
      />,
    );

    for (const column of [
      '채널 계정',
      '상품',
      '옵션 SKU',
      '식별자',
      '판매 메타데이터',
      'Sellpia 구성',
      '상태 / 작업',
    ]) {
      expect(screen.getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    expect(screen.getByText('쿠팡 Wing')).toBeInTheDocument();
    expect(screen.getByText('등록 상품명')).toBeInTheDocument();
    expect(screen.getByText('product-10')).toBeInTheDocument();
    expect(screen.getByText('핑크')).toBeInTheDocument();
    expect(screen.getByText('sku-20')).toBeInTheDocument();
    expect(screen.getByText('seller-30')).toBeInTheDocument();
    expect(screen.getByText('8801234567890')).toBeInTheDocument();
    expect(screen.getByText('MODEL-40')).toBeInTheDocument();
    expect(screen.getByText('가격 없음')).toBeInTheDocument();
    const dataRow = screen.getAllByRole('row')[1];
    expect(dataRow).toHaveTextContent('SP-001 · 셀피아 상품 · 분홍 × 4');
    expect(dataRow).toHaveTextContent('현재 재고 8');
    expect(dataRow).toHaveTextContent('판매 가능 2');
    expect(dataRow).toHaveTextContent('매입가 1,500원');
    expect(dataRow).toHaveTextContent('구성 가능 2');
    expect(dataRow).toHaveTextContent('병목');
    expect(screen.getByText('매칭 완료')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'sku-20 Sellpia 구성 편집' }));
    expect(onEdit).toHaveBeenCalledWith(item);
  });

  it('renders loading and caller-owned empty messages without stale rows', () => {
    const { rerender } = render(
      <ChannelSkuMappingTable
        items={[]}
        total={0}
        page={1}
        limit={50}
        loading
        emptyMessage="가져온 카탈로그가 없습니다."
        onPageChange={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('채널 SKU를 불러오는 중입니다.')).toBeInTheDocument();

    rerender(
      <ChannelSkuMappingTable
        items={[]}
        total={0}
        page={1}
        limit={50}
        loading={false}
        emptyMessage="가져온 카탈로그가 없습니다."
        onPageChange={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('가져온 카탈로그가 없습니다.')).toBeInTheDocument();
  });
});
