import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChannelAccountListItemSchema,
  type ChannelAccountListItem,
} from '@kiditem/shared/channel-account';
import {
  ChannelSkuMappingListResponseSchema,
  ChannelSkuMatchCandidateListResponseSchema,
  RefreshChannelSkuMappingStatusResponseSchema,
  ReplaceChannelSkuComponentsInputSchema,
} from '@kiditem/shared/channel-sku-matching';
import { CoupangWingCatalogImportResponseSchema } from '@kiditem/shared/source-import';
import { apiClient } from '@/lib/api-client';
import {
  importCoupangWingCatalog,
  listChannelAccounts,
  listChannelSkuCandidates,
  listChannelSkuMappings,
  refreshChannelSkuMappingStatuses,
  replaceChannelSkuComponents,
} from './channel-sku-matching-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getParsed: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    uploadParsed: vi.fn(),
  },
}));

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_SKU_ID = '22222222-2222-4222-8222-222222222222';
const MASTER_PRODUCT_ID = '33333333-3333-4333-8333-333333333333';

const account: ChannelAccountListItem = {
  id: ACCOUNT_ID,
  channel: 'coupang',
  name: '쿠팡 Wing',
  externalAccountId: 'wing-1',
  vendorId: 'A0001',
  sellerId: null,
  isPrimary: true,
};

const now = '2026-07-11T00:00:00.000Z';

const mappingResponse = {
  items: [
    {
      channelAccount: {
        id: ACCOUNT_ID,
        channel: 'coupang',
        name: '쿠팡 Wing',
      },
      product: {
        id: '44444444-4444-4444-8444-444444444444',
        externalProductId: 'product-1',
        registeredName: '등록 상품',
        displayName: '노출 상품',
        status: '판매중',
      },
      sku: {
        id: CHANNEL_SKU_ID,
        externalSkuId: 'sku-1',
        sellerSku: null,
        optionName: '분홍',
        barcode: '8801234567890',
        modelNumber: 'MODEL-1',
        salePrice: 12000,
        status: '판매중',
        mappingStatus: 'unmatched',
        sellableStock: null,
        updatedAt: now,
      },
      components: [],
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
  counts: { all: 1, unmatched: 1, needsReview: 0, matched: 0 },
};

const candidateResponse = {
  items: [
    {
      masterProductId: MASTER_PRODUCT_ID,
      code: 'SP-001',
      name: '셀피아 상품',
      optionName: '분홍',
      barcode: '8801234567890',
      currentStock: 8,
      reason: 'unique_barcode',
      rank: 0,
    },
  ],
};

const wingResponse = {
  run: {
    id: '55555555-5555-4555-8555-555555555555',
    sourceType: 'coupang_wing_catalog',
    channelAccountId: ACCOUNT_ID,
    fileName: 'wing.xlsx',
    fileHash: 'a'.repeat(64),
    status: 'completed',
    rowCount: 1,
    importedAt: now,
    createdAt: now,
    updatedAt: now,
  },
  duplicate: false,
  changes: {
    createdProductCount: 1,
    updatedProductCount: 0,
    createdSkuCount: 1,
    updatedSkuCount: 0,
    skippedRowCount: 0,
  },
};

describe('channel SKU matching API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses active channel accounts through the focused account schema', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValueOnce([account]);

    await expect(listChannelAccounts()).resolves.toEqual([account]);
    expect(apiClient.getParsed).toHaveBeenCalledWith(
      '/api/channels/accounts',
      expect.objectContaining({ element: ChannelAccountListItemSchema }),
    );
  });

  it('builds a paged list query without empty search, all status, or tenant input', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValueOnce(mappingResponse);

    await expect(
      listChannelSkuMappings({
        channelAccountId: ACCOUNT_ID,
        mappingStatus: 'all',
        search: '   ',
        page: 2,
        limit: 50,
      }),
    ).resolves.toEqual(mappingResponse);

    expect(apiClient.getParsed).toHaveBeenCalledWith(
      `/api/channels/sku-mappings?channelAccountId=${ACCOUNT_ID}&page=2&limit=50`,
      ChannelSkuMappingListResponseSchema,
    );
  });

  it('includes a trimmed search and non-all status in canonical order', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValueOnce(mappingResponse);

    await listChannelSkuMappings({
      channelAccountId: ACCOUNT_ID,
      mappingStatus: 'needs_review',
      search: '  SP-001  ',
      page: 1,
      limit: 50,
    });

    expect(apiClient.getParsed).toHaveBeenCalledWith(
      `/api/channels/sku-mappings?channelAccountId=${ACCOUNT_ID}&mappingStatus=needs_review&search=SP-001&page=1&limit=50`,
      ChannelSkuMappingListResponseSchema,
    );
  });

  it('parses candidate responses and encodes the SKU path', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValueOnce(candidateResponse);

    await expect(
      listChannelSkuCandidates(`${CHANNEL_SKU_ID}/unsafe`, { search: '  SP  ' }),
    ).resolves.toEqual(candidateResponse);

    expect(apiClient.getParsed).toHaveBeenCalledWith(
      `/api/channels/sku-mappings/${encodeURIComponent(`${CHANNEL_SKU_ID}/unsafe`)}/candidates?search=SP`,
      ChannelSkuMatchCandidateListResponseSchema,
    );
  });

  it('manually parses the status refresh response', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      all: 3,
      unmatched: 1,
      needsReview: 1,
      matched: 1,
    });

    await expect(
      refreshChannelSkuMappingStatuses({ channelAccountId: ACCOUNT_ID }),
    ).resolves.toEqual({
      all: 3,
      unmatched: 1,
      needsReview: 1,
      matched: 1,
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/channels/sku-mappings/status-refresh',
      { channelAccountId: ACCOUNT_ID },
    );
    expect(
      RefreshChannelSkuMappingStatusResponseSchema.safeParse(
        vi.mocked(apiClient.post).mock.results[0]?.value,
      ).success,
    ).toBe(false);
  });

  it('parses component input before PUT and validates the unknown response', async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce(mappingResponse.items[0]);
    const input = {
      components: [{ masterProductId: MASTER_PRODUCT_ID, quantity: 4 }],
    };

    await expect(
      replaceChannelSkuComponents(`${CHANNEL_SKU_ID}/unsafe`, input),
    ).resolves.toEqual(mappingResponse.items[0]);
    expect(ReplaceChannelSkuComponentsInputSchema.parse(input)).toEqual(input);
    expect(apiClient.put).toHaveBeenCalledWith(
      `/api/channels/sku-mappings/${encodeURIComponent(`${CHANNEL_SKU_ID}/unsafe`)}/components`,
      input,
    );
  });

  it('rejects invalid component input before making a request', async () => {
    await expect(
      replaceChannelSkuComponents(CHANNEL_SKU_ID, {
        components: [{ masterProductId: MASTER_PRODUCT_ID, quantity: 0 }],
      }),
    ).rejects.toThrow();
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('uploads the Wing workbook to the encoded account path without tenant metadata', async () => {
    vi.mocked(apiClient.uploadParsed).mockResolvedValueOnce(wingResponse);
    const file = new File(['wing'], 'wing.xlsx');

    await expect(
      importCoupangWingCatalog(`${ACCOUNT_ID}/unsafe`, file),
    ).resolves.toEqual(wingResponse);

    expect(apiClient.uploadParsed).toHaveBeenCalledWith(
      `/api/channels/accounts/${encodeURIComponent(`${ACCOUNT_ID}/unsafe`)}/catalog-imports/coupang-wing`,
      CoupangWingCatalogImportResponseSchema,
      expect.any(FormData),
    );
    const form = vi.mocked(apiClient.uploadParsed).mock.calls[0]?.[2] as FormData;
    expect([...form.keys()]).toEqual(['file']);
    expect(form.get('file')).toBe(file);
  });
});
