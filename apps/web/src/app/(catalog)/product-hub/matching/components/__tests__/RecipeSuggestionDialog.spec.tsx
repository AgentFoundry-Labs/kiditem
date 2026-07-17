import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { RecipeSuggestionDialog } from '../RecipeSuggestionDialog';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/api-client', () => ({ apiClient: { getParsed: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

describe('<RecipeSuggestionDialog>', () => {
  it('loads a read-only proposal and never applies a recipe mutation', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({
      channelListingOptionId: '22222222-2222-4222-8222-222222222222', productVariantId: '33333333-3333-4333-8333-333333333333', masterProductId: '44444444-4444-4444-8444-444444444444',
      status: 'unique_code', reason: '고유 코드 일치', existingComponents: [],
      proposals: [{ sellpiaInventorySkuId: '55555555-5555-4555-8555-555555555555', code: 'SP-1', name: '본품', optionName: null, currentStock: 4, evidence: [{ kind: 'seller_sku_code', channelValue: 'SP-1', normalizedValue: 'SP-1' }], requiresQuantityConfirmation: true }],
    });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RecipeSuggestionDialog open onOpenChange={vi.fn()} row={{ channelAccount: { id: '11111111-1111-4111-8111-111111111111', channel: 'coupang', name: 'Wing' }, listing: { id: '11111111-1111-4111-8111-111111111112', externalId: 'listing', masterProductId: '44444444-4444-4444-8444-444444444444' }, option: { id: '22222222-2222-4222-8222-222222222222', externalOptionId: 'option', itemName: null, sellerSku: null, barcode: null, productVariantId: '33333333-3333-4333-8333-333333333333', updatedAt: '2026-07-16T00:00:00.000Z' }, linkedVariant: { id: '33333333-3333-4333-8333-333333333333', masterProductId: '44444444-4444-4444-8444-444444444444', code: 'KI-1', name: '옵션', optionLabel: null }, recipeStatus: 'configuration_required', capacity: null }} /></QueryClientProvider>);
    expect(await screen.findByText('SP-1 · 본품')).toBeInTheDocument();
    expect(screen.getByText(/수량과 다중 SKU BOM/)).toBeInTheDocument();
    expect(apiClient.put).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(apiClient.delete).not.toHaveBeenCalled();
  });
});
