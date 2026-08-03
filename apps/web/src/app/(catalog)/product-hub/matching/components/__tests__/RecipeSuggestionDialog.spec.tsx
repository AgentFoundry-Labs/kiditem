import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { RecipeSuggestionDialog } from '../RecipeSuggestionDialog';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const OPTION_ID = '22222222-2222-4222-8222-222222222222';
const VARIANT_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const SKU_ID = '55555555-5555-4555-8555-555555555555';

describe('<RecipeSuggestionDialog>', () => {
  it('selects a recommended Sellpia SKU and saves the chosen quantity', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.mocked(apiClient.getParsed).mockResolvedValue({
      channelListingOptionId: OPTION_ID,
      productVariantId: VARIANT_ID,
      masterProductId: PRODUCT_ID,
      status: 'quantity_review',
      automationDecision: 'operator_review',
      recommendedQuantity: null,
      reason: '묶음 수량 확인 필요',
      existingComponents: [],
      proposals: [{
        sellpiaInventorySkuId: SKU_ID,
        code: 'SP-1',
        name: '본품',
        optionName: null,
        currentStock: 4,
        evidence: [{
          kind: 'fuzzy_name',
          channelValue: '본 품 2개',
          normalizedValue: '본품',
          score: 0.91,
        }],
        requiresQuantityConfirmation: true,
        recommendedQuantity: null,
      }],
    });
    vi.mocked(apiClient.put).mockResolvedValue({
      channelListingOptionId: OPTION_ID,
      productVariantId: VARIANT_ID,
      sellpiaInventorySkuId: SKU_ID,
      quantity: 2,
      status: 'created',
    });

    renderDialog(onOpenChange);

    expect(await screen.findByRole('heading', { name: 'Sellpia 재고 연결' })).toBeInTheDocument();
    expect(await screen.findByText('수량 확인 필요 · 묶음 수량 확인 필요')).toBeInTheDocument();
    expect(screen.getAllByText('SP-1 · 본품').length).toBeGreaterThan(0);

    const quantityInput = await screen.findByLabelText('차감 수량');
    expect(quantityInput).toHaveValue(1);
    await user.clear(quantityInput);
    await user.type(quantityInput, '2');
    await user.click(screen.getByRole('button', { name: /재고 연결 저장/ }));

    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith(
      `/api/channels/product-mappings/options/${OPTION_ID}/recipe`,
      { sellpiaInventorySkuId: SKU_ID, quantity: 2 },
    ));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

function renderDialog(onOpenChange = vi.fn()) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RecipeSuggestionDialog
        open
        onOpenChange={onOpenChange}
        row={{
          channelAccount: {
            id: '11111111-1111-4111-8111-111111111111',
            channel: 'coupang',
            name: 'Wing',
          },
          listing: {
            id: '11111111-1111-4111-8111-111111111112',
            externalId: 'listing',
            masterProductId: PRODUCT_ID,
          },
          option: {
            id: OPTION_ID,
            externalOptionId: 'option',
            itemName: null,
            sellerSku: null,
            barcode: null,
            productVariantId: VARIANT_ID,
            updatedAt: '2026-07-16T00:00:00.000Z',
          },
          linkedVariant: {
            id: VARIANT_ID,
            masterProductId: PRODUCT_ID,
            code: 'KI-1',
            name: '옵션',
            optionLabel: null,
          },
          recipeStatus: 'configuration_required',
          capacity: null,
        }}
      />
    </QueryClientProvider>,
  );
}
