import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChannelSkuMappingTable } from '../ChannelSkuMappingTable';

describe('<ChannelSkuMappingTable>', () => {
  it('requires product confirmation before option confirmation and keeps recipe read-only', () => {
    const onEditProduct = vi.fn();
    const onEditVariant = vi.fn();
    const products = [productRow()];
    const options = [
      optionRow(null),
      optionRow('33333333-3333-4333-8333-333333333333'),
      configurationRequiredOptionRow(),
    ];

    const { rerender } = render(
      <ChannelSkuMappingTable level="products" products={products} options={options} onEditProduct={onEditProduct} onEditVariant={onEditVariant} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '상품 연결' }));
    expect(onEditProduct).toHaveBeenCalledWith(products[0]);

    rerender(<ChannelSkuMappingTable level="options" products={products} options={options} onEditProduct={onEditProduct} onEditVariant={onEditVariant} />);
    expect(screen.getAllByRole('button', { name: '옵션 연결' })[0]).toBeDisabled();
    fireEvent.click(screen.getAllByRole('button', { name: '옵션 연결' })[1]);
    expect(onEditVariant).toHaveBeenCalledWith(options[1]);
    expect(screen.getAllByText('미매칭').length).toBeGreaterThan(0);
    expect(screen.getByText('재고 연결 필요')).toBeInTheDocument();
    expect(screen.getAllByText('판매 가능 미확정').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: '중앙 레시피 보기' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });
});

function productRow() {
  return {
    channelAccount: { id: '55555555-5555-4555-8555-555555555555', channel: 'coupang', name: 'Wing' },
    listing: { id: '11111111-1111-4111-8111-111111111111', externalId: 'listing-1', displayName: '채널 우산', status: 'active', masterProductId: null, updatedAt: '2026-07-16T00:00:00.000Z' },
    linkedProduct: null, optionCount: 2, linkedOptionCount: 0,
  } as const;
}

function configurationRequiredOptionRow() {
  const masterProductId = '33333333-3333-4333-8333-333333333333';
  const base = optionRow(masterProductId);
  return {
    ...base,
    option: {
      ...base.option,
      id: '44444444-4444-4444-8444-444444444444',
      externalOptionId: 'option-configuration-required',
      productVariantId: '66666666-6666-4666-8666-666666666666',
    },
    linkedVariant: {
      id: '66666666-6666-4666-8666-666666666666',
      code: 'KI-CONFIG',
      name: '구성 전 옵션',
      optionLabel: '색상: 파랑',
    },
    recipeStatus: 'configuration_required',
    capacity: null,
  } as const;
}

function optionRow(masterProductId: string | null) {
  return {
    channelAccount: { id: '55555555-5555-4555-8555-555555555555', channel: 'coupang', name: 'Wing' },
    listing: { id: '11111111-1111-4111-8111-111111111111', externalId: 'listing-1', masterProductId },
    option: { id: `${masterProductId ? '22222222' : '11111112'}-2222-4222-8222-222222222222`, externalOptionId: masterProductId ? 'option-2' : 'option-1', itemName: '분홍', sellerSku: null, barcode: null, productVariantId: null, updatedAt: '2026-07-16T00:00:00.000Z' },
    linkedVariant: null, recipeStatus: 'unmatched', capacity: null,
  } as const;
}
