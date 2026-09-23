import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegisteredListingCard } from './RegisteredListingCard';
import type { RegisteredChannelListing } from '../lib/channel-listings-api';

function listingFixture(overrides: Partial<RegisteredChannelListing> = {}): RegisteredChannelListing {
  return {
    id: 'listing-1',
    listingName: '자석 다트게임',
    thumbnailUrl: 'https://cdn.example.com/product.jpg',
    imageUrl: null, salesProductId: null,
    detailPageRevisionId: null,
    channel: 'coupang',
    channelAccountId: 'account-1',
    channelAccountName: '쿠팡 본계정',
    externalId: 'seller-product-1',
    channelName: '쿠팡 등록명',
    channelPrice: 12900,
    category: null,
    brand: null,
    manufacturer: null,
    sourceRecordId: 'candidate-1',
    contentWorkspaceId: 'workspace-1',
    status: 'active',
    exposureStatus: 'visible',
    optionCount: 2,
    mappingStatus: 'matched',
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('RegisteredListingCard', () => {
  it('shows the account registration state from the reader, not the raw listing status', () => {
    render(
      <RegisteredListingCard
        listing={listingFixture({
          status: 'APPROVED',
          salesProductId: 'sales-product-1',
          registration: {
            channelAccountId: '00000000-0000-4000-8000-000000000001',
            channel: 'coupang',
            channelAccountName: '쿠팡 본계정',
            registrationTargetId: null,
            channelListingId: '00000000-0000-4000-8000-0000000000c1',
            externalListingId: 'seller-product-1',
            state: 'registered',
            soldOut: true,
            changedSinceRegistration: true,
            selectedThumbnailAssetId: null,
            selectedDetailPageRevisionId: null,
            lastExecution: null,
          },
        })}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('등록됨')).toBeInTheDocument();
    expect(screen.getByText('품절')).toBeInTheDocument();
    expect(screen.getByText('변경됨 · 재전송 필요')).toBeInTheDocument();
    expect(screen.queryByText('APPROVED')).not.toBeInTheDocument();
  });

  it('falls back to the raw listing status only for a listing without a sales product', () => {
    render(<RegisteredListingCard listing={listingFixture({ status: 'APPROVED', registration: null })} onOpen={vi.fn()} />);
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
  });

  it('renders listing-owned content and mapping state', () => {
    const onOpen = vi.fn();

    render(
      <RegisteredListingCard
        listing={listingFixture()}
        onOpen={onOpen}
      />,
    );

    // 채널 이름은 레지스트리가 답한다 — 카드가 제 표를 들고 있지 않다(KID-250).
    expect(screen.getByText('쿠팡 WING')).toBeInTheDocument();
    expect(screen.getByText('재고 매칭 완료')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '콘텐츠 관리' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /AI 썸네일 생성/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '콘텐츠 관리' }));

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'listing-1' }));
  });

  it('keeps an unmatched listing visible and actionable', () => {
    const onOpen = vi.fn();
    render(
      <RegisteredListingCard
        listing={listingFixture({ mappingStatus: 'unmatched', contentWorkspaceId: null })}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByText('재고 매칭 필요')).toBeInTheDocument();
    expect(screen.getByText('콘텐츠 미연결')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: '콘텐츠 관리' });
    expect(button).toBeEnabled();

    fireEvent.click(button);

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'listing-1' }));
  });

  it('keeps the price row even when marketplace price is missing', () => {
    render(
      <RegisteredListingCard
        listing={listingFixture({ channelPrice: null })}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('가격 미지정')).toBeInTheDocument();
  });
});
