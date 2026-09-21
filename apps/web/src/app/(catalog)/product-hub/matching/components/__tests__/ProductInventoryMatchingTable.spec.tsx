import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  ChannelOptionMatchingQueueRow,
  ChannelProductMatchingQueueRow,
} from '@kiditem/shared/channel-product-matching';
import {
  ProductInventoryMatchingTable,
  productMatchingStatus,
} from '../ProductInventoryMatchingTable';

const account = {
  id: '11111111-1111-4111-8111-111111111111',
  channel: 'coupang',
  name: '쿠팡 본계정',
};
const listingId = '22222222-2222-4222-8222-222222222222';
const masterProductId = '33333333-3333-4333-8333-333333333333';
const optionId = '44444444-4444-4444-8444-444444444444';

function product(linked = true): ChannelProductMatchingQueueRow {
  return {
    channelAccount: account,
    listing: {
      id: listingId,
      externalId: '13712531060',
      displayName: '동물 친구들 블록',
      status: 'active',
      saleStatus: '판매중',
      masterProductId: linked ? masterProductId : null,
      channelImageUrl: null,
      updatedAt: '2026-08-03T00:00:00.000Z',
    },
    linkedProduct: linked ? {
      id: masterProductId,
      code: 'INV-SELLPIA-100',
      name: '동물 친구들 블록',
      displayImageUrl: null,
    } : null,
    optionCount: 1,
    configuredOptionCount: linked ? 1 : 0,
  };
}

function option({ configured = true, capacity = 8 }: { configured?: boolean; capacity?: number | null } = {}): ChannelOptionMatchingQueueRow {
  return {
    channelAccount: account,
    listing: {
      id: listingId,
      externalId: '13712531060',
      masterProductId,
    },
    option: {
      id: optionId,
      externalOptionId: '13712531060-10',
      itemName: '10개 묶음',
      sellerSku: 'PACK-10',
      barcode: null,
      updatedAt: '2026-08-03T00:00:00.000Z',
      inventoryComponents: configured ? [{
        id: '55555555-5555-4555-8555-555555555555',
        masterProductId: '66666666-6666-4666-8666-666666666666',
        code: 'SP-100',
        name: '동물 블록 낱개',
        optionName: null,
        barcode: null,
        currentStock: 85,
        quantity: 10,
      }] : [],
    },
    capacity: configured ? capacity : null,
  };
}

describe('<ProductInventoryMatchingTable />', () => {
  it('shows one product row and reveals direct channel option actions on expansion', () => {
    const onEditProduct = vi.fn();
    render(
      <ProductInventoryMatchingTable
        products={[product()]}
        options={[option()]}
        onEditProduct={onEditProduct}
      />,
    );

    expect(screen.getByText('매칭 완료')).toBeInTheDocument();
    expect(screen.getAllByText('동물 친구들 블록')).toHaveLength(2);
    expect(screen.queryByText(/INV-SELLPIA-/)).not.toBeInTheDocument();
    expect(screen.queryByText('SP-100')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(screen.getByText('SP-100').closest('p')).toHaveTextContent('차감 10');
    expect(screen.getByText('8개')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '재고 구성' })).not.toBeInTheDocument();
    expect(screen.getByText('기본 옵션')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '재고 매칭' }));
    expect(onEditProduct).toHaveBeenCalledWith(expect.objectContaining({ listing: expect.objectContaining({ id: listingId }) }));
  });

  it('treats a configured option as matched even when a mixed listing has no product summary', () => {
    const unlinkedProduct = product(false);
    const unlinkedOption = option();
    unlinkedOption.listing.masterProductId = null;
    render(
      <ProductInventoryMatchingTable
        products={[unlinkedProduct]}
        options={[unlinkedOption]}
        onEditProduct={vi.fn()}
      />,
    );

    expect(screen.getByText('매칭 완료')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(screen.getByText('옵션별로 서로 다른 재고상품에 연결되어 있습니다.')).toBeInTheDocument();
    expect(screen.getByText('8개')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '재고 매칭' })).toBeInTheDocument();
  });

  it('marks an option without a recipe as unmatched', () => {
    const unlinkedProduct = product(false);
    const unlinkedOption = option({ configured: false });
    unlinkedOption.listing.masterProductId = null;

    expect(productMatchingStatus(unlinkedProduct, [unlinkedOption])).toBe('unmatched');
  });

  it('keeps configured but unavailable stock in inventory review instead of unmatched', () => {
    expect(productMatchingStatus(product(), [option({ capacity: null })])).toBe('quantity_review');
  });

  it('auto-expands and highlights the exact channel option requested by a deep link', () => {
    render(
      <ProductInventoryMatchingTable
        products={[product()]}
        options={[option()]}
        focusOptionId={optionId}
        onEditProduct={vi.fn()}
      />,
    );

    expect(screen.getByText('PACK-10').closest('tr')).toHaveTextContent('차감 10');
  });
});
