import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  autoMatchChannelProducts,
  linkChannelListingProduct,
  getSellpiaManualMatchTargets,
  importSellpiaManualMatchSnapshot,
  listChannelProductCandidates,
  listChannelProductMappings,
} from './channel-sku-matching-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn(), post: vi.fn(), put: vi.fn(), uploadParsed: vi.fn() },
}));

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';

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

  it('keeps product candidate lookup side-effect-free', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValue({ items: [] });

    await listChannelProductCandidates(`${LISTING_ID}/unsafe`, ' KI-1 ');

    expect(apiClient.getParsed).toHaveBeenCalledWith(
      `/api/channels/product-mappings/${encodeURIComponent(`${LISTING_ID}/unsafe`)}/candidates?search=KI-1`,
      expect.any(Object),
    );
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('confirms only listing-to-MasterProduct identity', async () => {
    vi.mocked(apiClient.put).mockResolvedValue(undefined);

    await expect(linkChannelListingProduct(
      LISTING_ID,
      { masterProductId: PRODUCT_ID },
    )).resolves.toBeUndefined();

    expect(apiClient.put).toHaveBeenCalledWith(
      `/api/channels/product-mappings/${LISTING_ID}/master-product`,
      { masterProductId: PRODUCT_ID },
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

  it('reads and imports the bounded Sellpia manual-match snapshot', async () => {
    const snapshot = {
      source: 'sellpia_product_manual_match' as const,
      version: 1 as const,
      targetCount: 1,
      targetCodes: ['634-1'],
      rowCount: 1,
      rows: [{
        productCode: '634-1',
        aliasTitle: '샤이니무지개칼라링(12개입)',
        itemCount: 12,
        matchedType: 'M' as const,
        evidenceCount: 1,
      }],
    };
    vi.mocked(apiClient.getParsed).mockResolvedValue({
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourcePath: '/product_manual_match.html',
      version: 1,
      targetCount: 1,
      targetCodes: ['634-1'],
      currentSnapshot: null,
    });
    vi.mocked(apiClient.post).mockResolvedValue({
      status: {
        targetCount: 1,
        matchedTargetCount: 1,
        aliasCount: 1,
        snapshotHash: 'b'.repeat(64),
        capturedAt: '2026-07-31T04:00:00.000Z',
      },
    });

    await getSellpiaManualMatchTargets();
    await expect(importSellpiaManualMatchSnapshot(snapshot)).resolves.toMatchObject({
      status: { aliasCount: 1 },
    });

    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/channels/product-mappings/sellpia-manual-match/targets',
      expect.any(Object),
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/channels/product-mappings/sellpia-manual-match/import',
      snapshot,
    );
  });
});
