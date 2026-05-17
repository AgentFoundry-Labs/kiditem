import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegisteredListingCard } from './RegisteredListingCard';
import type { RegisteredChannelListing } from '../lib/channel-listings-api';

function listingFixture(overrides: Partial<RegisteredChannelListing> = {}): RegisteredChannelListing {
  return {
    id: 'listing-1',
    masterId: 'master-1',
    masterCode: 'M-00000001',
    masterName: '자석 다트게임',
    thumbnailUrl: 'https://cdn.example.com/product.jpg',
    channel: 'coupang',
    channelAccountId: 'account-1',
    channelAccountName: '쿠팡 본계정',
    externalId: 'seller-product-1',
    channelName: '쿠팡 등록명',
    channelPrice: 12900,
    sourceCandidateId: 'candidate-1',
    contentWorkspaceId: 'workspace-1',
    status: 'active',
    exposureStatus: 'visible',
    optionCount: 2,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('RegisteredListingCard', () => {
  it('renders product management action for a listing matched to MasterProduct', () => {
    const onOpen = vi.fn();
    const onManageProduct = vi.fn();

    render(
      <RegisteredListingCard
        listing={listingFixture()}
        onOpen={onOpen}
        onManageProduct={onManageProduct}
      />,
    );

    expect(screen.getByText('쿠팡')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상품 관리' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /AI 썸네일 생성/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '상품 관리' }));

    expect(onManageProduct).toHaveBeenCalledWith(expect.objectContaining({ id: 'listing-1' }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows inventory registration is needed when a listing is not matched to MasterProduct', () => {
    const onManageProduct = vi.fn();

    render(
      <RegisteredListingCard
        listing={listingFixture({ masterId: null })}
        onOpen={vi.fn()}
        onManageProduct={onManageProduct}
      />,
    );

    const button = screen.getByRole('button', { name: '재고 상품 등록 필요' });
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(onManageProduct).not.toHaveBeenCalled();
  });

  it('keeps the price row even when marketplace price is missing', () => {
    render(
      <RegisteredListingCard
        listing={listingFixture({ channelPrice: null })}
        onOpen={vi.fn()}
        onManageProduct={vi.fn()}
      />,
    );

    expect(screen.getByText('가격 미지정')).toBeInTheDocument();
  });
});
