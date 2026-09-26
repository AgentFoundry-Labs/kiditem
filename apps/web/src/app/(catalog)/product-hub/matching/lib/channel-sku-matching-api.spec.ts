import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import {
  autoMatchChannelProducts,
  importCoupangRocketMatchingCsv,
  listChannelProductMappings,
  readSellpiaManualMatchSource,
  listRecipeComponentCandidates,
  saveProductInventoryMatching,
} from './channel-sku-matching-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn(), post: vi.fn(), put: vi.fn(), uploadParsed: vi.fn() },
}));

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';
const OPTION_ID = '44444444-4444-4444-8444-444444444444';
const OPERATION_ID = '66666666-6666-4666-8666-666666666666';

describe('channel product matching API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the two-level queue with canonical account and search filters', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({ products: [], options: [], counts: { products: { all: 0, linked: 0, unlinked: 0 }, options: { all: 0, configured: 0, unconfigured: 0 } } });

    await listChannelProductMappings({ channelAccountId: 'account/unsafe', search: '  우산  ' });

    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/channels/product-mappings?channelAccountId=account%2Funsafe&search=%EC%9A%B0%EC%82%B0',
      expect.any(Object),
    );
  });

  it('runs deterministic direct matching for one account', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      evaluatedListings: 3,
      matchedListings: 2,
      configuredOptions: 4,
    });

    await expect(autoMatchChannelProducts(ACCOUNT_ID)).resolves.toEqual({
      evaluatedListings: 3,
      matchedListings: 2,
      configuredOptions: 4,
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/channels/product-mappings/auto-match',
      { channelAccountId: ACCOUNT_ID },
    );
  });

  it('uploads a Rocket-Sellpia matching CSV as one rocket_matching_csv operation and reads its result', async () => {
    const file = new File(['rocket'], 'rocket443-sellpia-matching.csv', { type: 'text/csv' });
    const changes = { rowCount: 443, createdProductCount: 266, updatedProductCount: 177, createdSkuCount: 266, updatedSkuCount: 177 };
    vi.mocked(apiClient.uploadParsed).mockResolvedValue({ operation: { id: OPERATION_ID, result: changes } });

    await expect(importCoupangRocketMatchingCsv(ACCOUNT_ID, file))
      .resolves.toEqual({ duplicate: false, operationId: OPERATION_ID, changes });
    expect(apiClient.uploadParsed).toHaveBeenCalledWith(
      `/api/channels/accounts/${ACCOUNT_ID}/catalog-imports/coupang-rocket-matching`,
      expect.any(Object),
      expect.any(FormData),
    );
  });

  it('reports a re-upload of the same CSV as already imported', async () => {
    const file = new File(['rocket'], 'rocket443-sellpia-matching.csv', { type: 'text/csv' });
    vi.mocked(apiClient.uploadParsed).mockRejectedValue(
      new ApiError(409, 'DB_CONFLICT', '이미 반영한 파일입니다', { reason: 'file_already_applied' }),
    );

    await expect(importCoupangRocketMatchingCsv(ACCOUNT_ID, file)).resolves.toMatchObject({ duplicate: true, operationId: null });
  });

  it('searches Products-owned Sellpia inventory candidates', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({ items: [] });

    await listRecipeComponentCandidates({ search: ' SP-100 ', includeOutOfStock: true });

    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/products/recipe-component-candidates?search=SP-100&limit=20&stockStatus=all',
      expect.any(Object),
    );
  });

  it('saves option inventory compositions without a separate product link command', async () => {
    vi.mocked(apiClient.put).mockResolvedValue(undefined);

    await saveProductInventoryMatching({
      channelListingId: LISTING_ID,
      options: [{
        channelListingOptionId: OPTION_ID,
        expectedComponents: [{ masterProductId: '77777777-7777-4777-8777-777777777777', quantity: 1 }],
        components: [{
          masterProductId: '66666666-6666-4666-8666-666666666666',
          quantity: 10,
        }],
      }],
    });

    expect(apiClient.put.mock.calls).toEqual([
      [`/api/channels/options/${OPTION_ID}/inventory-components`, {
        expectedComponents: [{ masterProductId: '77777777-7777-4777-8777-777777777777', quantity: 1 }],
        components: [{ masterProductId: '66666666-6666-4666-8666-666666666666', quantity: 10 }],
      }],
    ]);
  });

  it('reads the manual-match source (latest operation and published snapshot)', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({ latestOperation: null, currentSnapshot: null });

    await expect(readSellpiaManualMatchSource()).resolves.toEqual({ latestOperation: null, currentSnapshot: null });
    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/channels/product-mappings/sellpia-manual-match/source',
      expect.any(Object),
    );
  });
});
