import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { upsertChannelCatalogIdentities } from './channel-catalog-identity-upsert';

const organizationId = '11111111-1111-4111-8111-111111111111';
const channelAccountId = '22222222-2222-4222-8222-222222222222';
const runId = '33333333-3333-4333-8333-333333333333';

function input() {
  return {
    organizationId,
    channelAccountId,
    lastImportRunId: runId,
    rawSource: 'coupang_rocket_po_catalog',
    products: [{
      externalProductId: 'P-1',
      registeredName: '상품 1',
      displayName: null,
      category: null,
      manufacturer: null,
      brand: null,
      productStatus: 'observed',
      raw: { source: 'rocket' },
      options: [{
        externalOptionId: 'P-1',
        optionName: '상품 1',
        salePrice: null,
        sellerSku: 'P-1',
        barcode: '8801234567890',
        modelNumber: null,
        skuStatus: 'observed',
        attributes: {},
        raw: { poNumber: '1001' },
      }],
    }],
  };
}

describe('upsertChannelCatalogIdentities', () => {
  it('upserts listing and option identity without touching recipes or inactivating observations', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const tx = {
      channelListing: {
        findMany: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'listing-1', externalId: 'P-1' }])
          .mockResolvedValueOnce([{
            id: 'listing-1',
            externalId: 'P-1',
            masterProductId: 'master-1',
            options: [{
              id: 'option-1',
              externalOptionId: 'P-1',
              productVariantId: 'variant-1',
            }],
          }]),
      },
      channelListingOption: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $executeRaw: executeRaw,
    };

    const result = await upsertChannelCatalogIdentities(tx as never, input());

    expect(result.changes).toEqual({
      createdProductCount: 1,
      updatedProductCount: 0,
      createdSkuCount: 1,
      updatedSkuCount: 0,
    });
    expect(result.persistedListings).toEqual([{
      id: 'listing-1',
      externalProductId: 'P-1',
      masterProductId: 'master-1',
      options: [{
        id: 'option-1',
        externalOptionId: 'P-1',
        productVariantId: 'variant-1',
      }],
    }]);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    const sql = executeRaw.mock.calls.map(([statement]) =>
      Array.isArray(statement) ? statement.join('?') : statement.sql).join('\n');
    expect(sql).toContain('ON CONFLICT');
    expect(sql).not.toContain('channel_sku_components');
    expect(sql).not.toContain('DELETE');
    expect(sql).not.toContain('is_active = FALSE');
    expect(sql).not.toContain('master_product_id');
    expect(sql).not.toContain('product_variant_id');
  });

  it('does not allow an existing option identity to move to another parent', async () => {
    const tx = {
      channelListing: { findMany: vi.fn().mockResolvedValue([]) },
      channelListingOption: { findMany: vi.fn().mockResolvedValue([{
        externalOptionId: 'P-1',
        listing: { externalId: 'OTHER' },
      }]) },
    };

    await expect(upsertChannelCatalogIdentities(tx as never, input()))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
