import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegisteredProductGroupCard } from './RegisteredProductGroupCard';
import type { RegisteredProductGroup } from '../lib/channel-listings-api';

function groupFixture(overrides: Partial<RegisteredProductGroup> = {}): RegisteredProductGroup {
  return {
    masterId: 'master-1',
    masterCode: 'M-00000001',
    masterName: '자석 다트게임',
    thumbnailUrl: 'https://cdn.example.com/product.jpg',
    listingCount: 2,
    updatedAt: '2026-05-17T00:00:00.000Z',
    listings: [
      {
        id: 'listing-1',
        masterId: 'master-1',
        masterCode: 'M-00000001',
        masterName: '자석 다트게임',
        thumbnailUrl: 'https://cdn.example.com/product.jpg',
        channel: 'coupang',
        channelAccountId: 'account-1',
        channelAccountName: '쿠팡 본계정',
        externalId: '720445',
        channelName: '쿠팡 상품명',
        channelPrice: null,
        sourceCandidateId: 'candidate-1',
        contentWorkspaceId: 'workspace-1',
        status: 'active',
        exposureStatus: 'visible',
        optionCount: 1,
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-17T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('RegisteredProductGroupCard', () => {
  it('uses the same card layout and keeps a stable price row when price is missing', () => {
    render(
      <RegisteredProductGroupCard
        group={groupFixture()}
        onOpen={vi.fn()}
        onManageProduct={vi.fn()}
      />,
    );

    expect(screen.getByText('자석 다트게임')).toBeInTheDocument();
    expect(screen.getByText('쿠팡 · 쿠팡 본계정 · 720445')).toBeInTheDocument();
    expect(screen.getByText('가격 미지정')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상품 관리' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /AI 썸네일 생성/ })).not.toBeInTheDocument();
  });

  it('opens product management for the MasterProduct group', () => {
    const onManageProduct = vi.fn();
    const group = groupFixture();

    render(
      <RegisteredProductGroupCard
        group={group}
        onOpen={vi.fn()}
        onManageProduct={onManageProduct}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '상품 관리' }));

    expect(onManageProduct).toHaveBeenCalledWith(group);
  });
});
