import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  linkChannelListingOption,
  linkChannelListingProduct,
  applyChannelRecipeAutomation,
  getChannelRecipeSuggestion,
  getChannelRecipeAutomationPreview,
  listChannelProductCandidates,
  listChannelProductMappings,
  listChannelVariantCandidates,
} from './channel-sku-matching-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn(), post: vi.fn(), put: vi.fn(), uploadParsed: vi.fn() },
}));

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const OPTION_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const VARIANT_ID = '44444444-4444-4444-8444-444444444444';
const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';

describe('channel product matching API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the two-level queue with canonical account and search filters', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({ products: [], options: [], counts: { products: { all: 0, linked: 0, unlinked: 0 }, options: { all: 0, linked: 0, unlinked: 0, recipeConfirmed: 0, configurationRequired: 0, reviewRequired: 0 } } });

    await listChannelProductMappings({ channelAccountId: 'account/unsafe', search: '  우산  ' });

    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/channels/product-mappings?channelAccountId=account%2Funsafe&search=%EC%9A%B0%EC%82%B0',
      expect.any(Object),
    );
  });

  it('keeps product and variant candidate lookup side-effect-free', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({ items: [] });

    await listChannelProductCandidates(`${LISTING_ID}/unsafe`, ' KI-1 ');
    await listChannelVariantCandidates(`${OPTION_ID}/unsafe`, ' 분홍 ');

    expect(apiClient.getParsed).toHaveBeenNthCalledWith(1,
      `/api/channels/product-mappings/${encodeURIComponent(`${LISTING_ID}/unsafe`)}/candidates?search=KI-1`,
      expect.any(Object),
    );
    expect(apiClient.getParsed).toHaveBeenNthCalledWith(2,
      `/api/channels/product-mappings/options/${encodeURIComponent(`${OPTION_ID}/unsafe`)}/candidates?search=${encodeURIComponent('분홍')}`,
      expect.any(Object),
    );
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('reads a recipe suggestion without issuing a mutation', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({
      channelListingOptionId: OPTION_ID,
      productVariantId: VARIANT_ID,
      masterProductId: PRODUCT_ID,
      status: 'no_match',
      reason: 'No evidence matched an active Sellpia SKU.',
      channelEvidence: [],
      existingComponents: [],
      proposals: [],
    });

    await getChannelRecipeSuggestion(`${OPTION_ID}/unsafe`);

    expect(apiClient.getParsed).toHaveBeenCalledWith(
      `/api/channels/product-mappings/options/${encodeURIComponent(`${OPTION_ID}/unsafe`)}/recipe-suggestions`,
      expect.any(Object),
    );
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('reads and applies a version-fenced account recipe preview', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({
      channelAccountId: ACCOUNT_ID,
      proposalVersion: 'a'.repeat(64),
      generatedAt: '2026-07-18T00:00:00.000Z',
      summary: { variants: 0, affectedOptions: 0, autoApply: 0, operatorReview: 0, blocked: 0, alreadyConfigured: 0 },
      items: [],
    });
    vi.mocked(apiClient.post).mockResolvedValue({
      proposalVersion: 'a'.repeat(64),
      appliedVariants: 1,
      affectedOptions: 2,
      skippedExistingVariants: 0,
    });

    await getChannelRecipeAutomationPreview(`${ACCOUNT_ID}/unsafe`);
    await applyChannelRecipeAutomation({
      channelAccountId: ACCOUNT_ID,
      proposalVersion: 'a'.repeat(64),
    });

    expect(apiClient.getParsed).toHaveBeenCalledWith(
      `/api/channels/product-mappings/recipe-automation/preview?channelAccountId=${encodeURIComponent(`${ACCOUNT_ID}/unsafe`)}`,
      expect.any(Object),
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/channels/product-mappings/recipe-automation/apply',
      { channelAccountId: ACCOUNT_ID, proposalVersion: 'a'.repeat(64) },
    );
  });

  it('confirms listing-to-product and option-to-variant separately', async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce({
      channelAccount: { id: '55555555-5555-4555-8555-555555555555', channel: 'coupang', name: 'Wing' },
      listing: { id: LISTING_ID, externalId: 'listing-1', displayName: '우산', status: 'active', masterProductId: PRODUCT_ID, updatedAt: '2026-07-16T00:00:00.000Z' },
      linkedProduct: { id: PRODUCT_ID, code: 'KI-1', name: '우산' },
      optionCount: 1,
      linkedOptionCount: 1,
    }).mockResolvedValueOnce({
      channelAccount: { id: '55555555-5555-4555-8555-555555555555', channel: 'coupang', name: 'Wing' },
      listing: { id: LISTING_ID, externalId: 'listing-1', masterProductId: PRODUCT_ID },
      option: { id: OPTION_ID, externalOptionId: 'option-1', itemName: '분홍', sellerSku: null, barcode: null, productVariantId: VARIANT_ID, updatedAt: '2026-07-16T00:00:00.000Z' },
      linkedVariant: { id: VARIANT_ID, masterProductId: PRODUCT_ID, code: 'KI-1-PINK', name: '분홍', optionLabel: '색상: 분홍' },
      recipeStatus: 'configuration_required',
      capacity: null,
    });

    await linkChannelListingProduct(LISTING_ID, { masterProductId: PRODUCT_ID });
    await linkChannelListingOption(OPTION_ID, { productVariantId: VARIANT_ID });

    expect(apiClient.put).toHaveBeenNthCalledWith(1,
      `/api/channels/product-mappings/${LISTING_ID}/master-product`,
      { masterProductId: PRODUCT_ID },
    );
    expect(apiClient.put).toHaveBeenNthCalledWith(2,
      `/api/channels/product-mappings/options/${OPTION_ID}/product-variant`,
      { productVariantId: VARIANT_ID },
    );
  });
});
