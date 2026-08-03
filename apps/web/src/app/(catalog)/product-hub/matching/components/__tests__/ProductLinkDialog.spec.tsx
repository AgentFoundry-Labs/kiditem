import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useChannelProductCandidates,
  useLinkChannelListingProduct,
  useRecipeComponentCandidates,
  useSaveProductInventoryMatching,
} from '../../hooks/useChannelSkuMappings';
import { ProductLinkDialog } from '../ProductLinkDialog';

vi.mock('../../hooks/useChannelSkuMappings', () => ({
  useChannelProductCandidates: vi.fn(),
  useLinkChannelListingProduct: vi.fn(),
  useRecipeComponentCandidates: vi.fn(),
  useSaveProductInventoryMatching: vi.fn(),
}));

describe('<ProductLinkDialog>', () => {
  const save = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useChannelProductCandidates).mockReturnValue({
      data: { items: [{
        masterProductId: '33333333-3333-4333-8333-333333333333', code: 'CP-333', name: '우산', category: null, brand: null,
        reason: 'exact_code', evidence: { providerIdentity: null, code: 'CP-333', barcode: null, normalizedName: null, aiExplanation: null, score: 1 }, rank: 1,
      }] }, isLoading: false, error: null,
    } as ReturnType<typeof useChannelProductCandidates>);
    vi.mocked(useRecipeComponentCandidates).mockReturnValue({
      data: { items: [{
        sellpiaInventorySkuId: '66666666-6666-4666-8666-666666666666',
        code: 'SP-100',
        name: '우산 낱개',
        optionName: null,
        barcode: null,
        currentStock: 80,
        availableStock: 80,
        isActive: true,
      }] }, isLoading: false, error: null,
    } as ReturnType<typeof useRecipeComponentCandidates>);
    vi.mocked(useSaveProductInventoryMatching).mockReturnValue({
      mutateAsync: save,
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useSaveProductInventoryMatching>);
    vi.mocked(useLinkChannelListingProduct).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useLinkChannelListingProduct>);
  });

  it('confirms the operating product, Sellpia SKU, and deduction quantity in one modal', async () => {
    render(<ProductLinkDialog open onOpenChange={vi.fn()} row={productRow()} options={[optionRow()]} />);

    fireEvent.click(screen.getByRole('button', { name: /우산.*선택/ }));
    fireEvent.click(screen.getByRole('button', { name: 'SP-100 재고 선택' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'SP-100 차감 수량' }), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: '운영상품·재고 매칭 저장' }));

    await waitFor(() => expect(save).toHaveBeenCalledWith({
      channelListingId: '11111111-1111-4111-8111-111111111111',
      masterProductId: '33333333-3333-4333-8333-333333333333',
      options: [{
        channelListingOptionId: '44444444-4444-4444-8444-444444444444',
        components: [{
          sellpiaInventorySkuId: '66666666-6666-4666-8666-666666666666',
          quantity: 10,
        }],
      }],
    }));
  });
});

function productRow() {
  return {
    channelAccount: { id: '55555555-5555-4555-8555-555555555555', channel: 'coupang', name: 'Wing' },
    listing: { id: '11111111-1111-4111-8111-111111111111', externalId: 'listing-1', displayName: '채널 우산', status: 'active', saleStatus: '판매중', masterProductId: null, channelImageUrl: null, updatedAt: '2026-08-03T00:00:00.000Z' },
    linkedProduct: null,
    optionCount: 1,
    configuredOptionCount: 0,
  } as const;
}

function optionRow() {
  return {
    channelAccount: { id: '55555555-5555-4555-8555-555555555555', channel: 'coupang', name: 'Wing' },
    listing: { id: '11111111-1111-4111-8111-111111111111', externalId: 'listing-1', masterProductId: null },
    option: {
      id: '44444444-4444-4444-8444-444444444444',
      externalOptionId: 'option-1',
      itemName: '우산 10개',
      sellerSku: 'SP-100',
      barcode: null,
      updatedAt: '2026-08-03T00:00:00.000Z',
      inventoryComponents: [],
    },
    capacity: null,
  } as const;
}
