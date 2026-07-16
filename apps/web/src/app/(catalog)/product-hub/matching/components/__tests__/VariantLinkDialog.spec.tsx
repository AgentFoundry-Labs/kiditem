import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChannelVariantCandidates, useLinkChannelListingOption } from '../../hooks/useChannelSkuMappings';
import { VariantLinkDialog } from '../VariantLinkDialog';

vi.mock('../../hooks/useChannelSkuMappings', () => ({
  useChannelVariantCandidates: vi.fn(),
  useLinkChannelListingOption: vi.fn(),
}));

describe('<VariantLinkDialog>', () => {
  it('confirms option-to-ProductVariant only within the already linked product', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useChannelVariantCandidates).mockReturnValue({
      data: { items: [{
        productVariantId: '44444444-4444-4444-8444-444444444444', masterProductId: '33333333-3333-4333-8333-333333333333', code: 'KI-1-PINK', name: '분홍', optionLabel: '색상: 분홍',
        reason: 'exact_normalized_name', evidence: { providerIdentity: null, code: null, barcode: null, normalizedName: '분홍', aiExplanation: null, score: 0.9 }, rank: 1,
      }] }, isLoading: false, error: null,
    } as ReturnType<typeof useChannelVariantCandidates>);
    vi.mocked(useLinkChannelListingOption).mockReturnValue({ mutateAsync, isPending: false, error: null } as unknown as ReturnType<typeof useLinkChannelListingOption>);

    render(<VariantLinkDialog open onOpenChange={vi.fn()} row={optionRow()} />);

    expect(mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '이 옵션으로 확인' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      channelListingOptionId: '22222222-2222-4222-8222-222222222222',
      productVariantId: '44444444-4444-4444-8444-444444444444',
    }));
  });
});

function optionRow() {
  return {
    channelAccount: { id: '55555555-5555-4555-8555-555555555555', channel: 'coupang', name: 'Wing' },
    listing: { id: '11111111-1111-4111-8111-111111111111', externalId: 'listing-1', masterProductId: '33333333-3333-4333-8333-333333333333' },
    option: { id: '22222222-2222-4222-8222-222222222222', externalOptionId: 'option-1', itemName: '분홍', sellerSku: null, barcode: null, productVariantId: null, updatedAt: '2026-07-16T00:00:00.000Z' },
    linkedVariant: null,
    recipeStatus: 'unmatched',
    capacity: null,
  } as const;
}
