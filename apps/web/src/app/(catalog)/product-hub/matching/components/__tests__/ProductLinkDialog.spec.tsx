import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChannelProductCandidates, useLinkChannelListingProduct } from '../../hooks/useChannelSkuMappings';
import { ProductLinkDialog } from '../ProductLinkDialog';

vi.mock('../../hooks/useChannelSkuMappings', () => ({
  useChannelProductCandidates: vi.fn(),
  useLinkChannelListingProduct: vi.fn(),
}));

describe('<ProductLinkDialog>', () => {
  it('only confirms listing-to-MasterProduct after an explicit operator action', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useChannelProductCandidates).mockReturnValue({
      data: { items: [{
        masterProductId: '33333333-3333-4333-8333-333333333333', code: 'KI-1', name: '우산', category: null, brand: null,
        reason: 'exact_code', evidence: { providerIdentity: null, code: 'KI-1', barcode: null, normalizedName: null, aiExplanation: null, score: 1 }, rank: 1,
      }] }, isLoading: false, error: null,
    } as ReturnType<typeof useChannelProductCandidates>);
    vi.mocked(useLinkChannelListingProduct).mockReturnValue({ mutateAsync, isPending: false, error: null } as unknown as ReturnType<typeof useLinkChannelListingProduct>);

    render(<ProductLinkDialog open onOpenChange={vi.fn()} row={productRow()} />);

    expect(screen.getByText('KI-1 · 우산')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '이 상품으로 확인' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      channelListingId: '11111111-1111-4111-8111-111111111111',
      masterProductId: '33333333-3333-4333-8333-333333333333',
    }));
  });
});

function productRow() {
  return {
    channelAccount: { id: '55555555-5555-4555-8555-555555555555', channel: 'coupang', name: 'Wing' },
    listing: { id: '11111111-1111-4111-8111-111111111111', externalId: 'listing-1', displayName: '채널 우산', status: 'active', masterProductId: null, updatedAt: '2026-07-16T00:00:00.000Z' },
    linkedProduct: null,
    optionCount: 1,
    linkedOptionCount: 0,
  } as const;
}
