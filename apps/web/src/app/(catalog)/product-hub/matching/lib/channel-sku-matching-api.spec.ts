import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  autoMatchChannelProducts,
  beginSellpiaManualMatchSourceAttempt,
  getSellpiaManualMatchTargets,
  importCoupangRocketMatchingCsv,
  listChannelProductMappings,
  readSellpiaManualMatchSourceAttempt,
  readSellpiaManualMatchSourceCurrent,
  listRecipeComponentCandidates,
  saveProductInventoryMatching,
} from './channel-sku-matching-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn(), post: vi.fn(), put: vi.fn(), uploadParsed: vi.fn() },
}));

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';
const OPTION_ID = '44444444-4444-4444-8444-444444444444';

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

  it('uploads a Rocket-Sellpia matching CSV through the Rocket catalog endpoint', async () => {
    const file = new File(['rocket'], 'rocket443-sellpia-matching.csv', { type: 'text/csv' });
    vi.mocked(apiClient.uploadParsed).mockResolvedValue({
      duplicate: false,
      changes: {
        createdProductCount: 266,
        updatedProductCount: 177,
        createdSkuCount: 266,
        updatedSkuCount: 177,
      },
    });

    await importCoupangRocketMatchingCsv(ACCOUNT_ID, file);

    expect(apiClient.uploadParsed).toHaveBeenCalledWith(
      `/api/channels/accounts/${ACCOUNT_ID}/catalog-imports/coupang-rocket-matching`,
      expect.any(Object),
      expect.any(FormData),
    );
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
        components: [{
          sellpiaInventorySkuId: '66666666-6666-4666-8666-666666666666',
          quantity: 10,
        }],
      }],
    });

    expect(apiClient.put.mock.calls).toEqual([
      [`/api/products/channel-options/${OPTION_ID}/inventory-components`, { components: [{ sellpiaInventorySkuId: '66666666-6666-4666-8666-666666666666', quantity: 10 }] }],
    ]);
  });

  it('reads the target set and starts a frozen manual-match source attempt', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourcePath: '/product_manual_match.html',
      version: 1,
      targetCount: 1,
      targetCodes: ['634-1'],
      currentSnapshot: null,
    });
    vi.mocked(apiClient.post).mockResolvedValue({
      attemptId: '11111111-1111-4111-8111-111111111111',
      attemptToken: '22222222-2222-4222-8222-222222222222',
      state: 'RUNNING',
      expiresAt: '2099-01-01T00:00:00.000Z',
      plan: {
        sourceType: 'sellpia_product_manual_match',
        parserVersion: 'sellpia-manual-match-v1',
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourcePath: '/product_manual_match.html',
        targetCount: 1,
        targetCodes: ['634-1'],
      },
      contentChecksum: null,
      capturedAt: null,
      errorCode: null,
      errorMessage: null,
    });

    await getSellpiaManualMatchTargets();
    await beginSellpiaManualMatchSourceAttempt({ idempotencyKey: 'key-1' });

    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/channels/product-mappings/sellpia-manual-match/targets',
      expect.any(Object),
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/channels/product-mappings/sellpia-manual-match/attempts',
      {},
      { headers: { 'Idempotency-Key': 'key-1' } },
    );
  });

  it('reads the owner attempt and current status without re-importing a page snapshot', async () => {
    vi.mocked(apiClient.getParsed)
      .mockResolvedValueOnce({
        attemptId: '11111111-1111-4111-8111-111111111111',
        attemptToken: '22222222-2222-4222-8222-222222222222',
        state: 'COMPLETE',
        expiresAt: '2099-01-01T00:00:00.000Z',
        plan: {
          sourceType: 'sellpia_product_manual_match',
          parserVersion: 'sellpia-manual-match-v1',
          sourceOrigin: 'https://kiditem.sellpia.com',
          sourcePath: '/product_manual_match.html',
          targetCount: 1,
          targetCodes: ['634-1'],
        },
        contentChecksum: 'c'.repeat(64),
        capturedAt: '2026-07-31T04:00:00.000Z',
        errorCode: null,
        errorMessage: null,
      })
      .mockResolvedValueOnce({
        latestAttempt: {
          attemptId: '11111111-1111-4111-8111-111111111111',
          state: 'COMPLETE',
          expiresAt: '2099-01-01T00:00:00.000Z',
          plan: {
            sourceType: 'sellpia_product_manual_match',
            parserVersion: 'sellpia-manual-match-v1',
            sourceOrigin: 'https://kiditem.sellpia.com',
            sourcePath: '/product_manual_match.html',
            targetCount: 1,
            targetCodes: ['634-1'],
          },
          contentChecksum: 'c'.repeat(64),
          capturedAt: '2026-07-31T04:00:00.000Z',
          errorCode: null,
          errorMessage: null,
        },
        currentSnapshot: {
          targetCount: 1,
          matchedTargetCount: 1,
          aliasCount: 1,
          snapshotHash: 'c'.repeat(64),
          capturedAt: '2026-07-31T04:00:00.000Z',
        },
      });

    await expect(readSellpiaManualMatchSourceAttempt('11111111-1111-4111-8111-111111111111'))
      .resolves.toMatchObject({ state: 'COMPLETE' });
    await expect(readSellpiaManualMatchSourceCurrent()).resolves.toMatchObject({
      currentSnapshot: { aliasCount: 1 },
    });
  });
});
