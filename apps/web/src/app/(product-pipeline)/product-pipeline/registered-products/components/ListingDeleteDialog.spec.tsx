import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ListingDeleteDialog from './ListingDeleteDialog';

const listing = {
  id: '11111111-1111-4111-8111-111111111111', listingName: '과일바구니', thumbnailUrl: null,
  detailPageArtifactId: null, detailPageRevisionId: null, channel: 'coupang', channelAccountId: 'account',
  channelAccountName: '쿠팡', externalId: '16311428128', channelName: null, channelPrice: null,
  category: null, brand: null, manufacturer: null,
  sourceRecordId: 'candidate', contentWorkspaceId: null, status: 'active', exposureStatus: null,
  optionCount: 1, mappingStatus: 'matched' as const, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ListingDeleteDialog unsupported deletion boundary', () => {
  it('does not start a deletion when no independent confirmation path exists', () => {
    const onClose = vi.fn();
    render(<ListingDeleteDialog listing={listing} onClose={onClose} />);

    expect(screen.getByRole('status')).toHaveTextContent('현재 지원하지 않습니다');
    expect(screen.getByRole('button', { name: '삭제 지원 안 함' })).toBeDisabled();
    fireEvent.click(screen.getAllByRole('button', { name: '닫기' })[1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
