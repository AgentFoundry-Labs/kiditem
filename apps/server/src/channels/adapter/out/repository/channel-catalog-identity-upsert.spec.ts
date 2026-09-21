import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  updateChannelCatalogDetails,
  upsertChannelCatalogBasics,
  upsertChannelCatalogIdentities,
} from './channel-catalog-identity-upsert';

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
            }],
          }])
          .mockResolvedValueOnce([{
            id: 'listing-1',
            options: [{ inventoryComponents: [{ masterProductId: 'master-1' }] }],
          }]),
      },
      channelListingOption: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $executeRaw: executeRaw,
    };

    const result = await upsertChannelCatalogIdentities(tx as never, input());

    expect(result.mappingIdentityChanged).toBe(true);
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

  it('reports no mapping identity change for an active identity metadata refresh', async () => {
    const tx = {
      channelListing: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{
            id: 'listing-1',
            externalId: 'P-1',
            isActive: true,
          }])
          .mockResolvedValueOnce([{ id: 'listing-1', externalId: 'P-1' }])
          .mockResolvedValueOnce([{
            id: 'listing-1',
            externalId: 'P-1',
            masterProductId: 'master-1',
            options: [{ id: 'option-1', externalOptionId: 'P-1' }],
          }])
          .mockResolvedValueOnce([{
            id: 'listing-1',
            options: [{ inventoryComponents: [{ masterProductId: 'master-1' }] }],
          }]),
      },
      channelListingOption: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'option-1',
          externalOptionId: 'P-1',
          isActive: true,
          listing: { externalId: 'P-1' },
        }]),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
    };

    const result = await upsertChannelCatalogIdentities(tx as never, input());

    expect(result.mappingIdentityChanged).toBe(false);
    const sql = tx.$executeRaw.mock.calls
      .map(([statement]) => Array.isArray(statement) ? statement.join('?') : String(statement))
      .join('\n');
    expect(sql).toContain('display_name = COALESCE(EXCLUDED.display_name, channel_listings.display_name)');
    expect(sql).toContain('category = COALESCE(EXCLUDED.category, channel_listings.category)');
    expect(sql).toContain('manufacturer = COALESCE(EXCLUDED.manufacturer, channel_listings.manufacturer)');
    expect(sql).toContain('brand = COALESCE(EXCLUDED.brand, channel_listings.brand)');
    expect(sql).toContain('status = COALESCE(EXCLUDED.status, channel_listings.status)');
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

function basicInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId,
    channelAccountId,
    lastImportRunId: runId,
    rawSource: 'coupang_catalog_basics',
    products: [{
      externalProductId: 'P-1',
      registeredName: '상품 1',
      displayName: '상품 1',
      category: null,
      manufacturer: null,
      brand: null,
      productStatus: 'observed',
      raw: { source: 'wing' },
      options: [{
        externalOptionId: 'vendor-1',
        optionName: '상품 1',
        salePrice: 0,
        sellerSku: null,
        barcode: null,
        modelNumber: null,
        skuStatus: null,
        attributes: [],
        raw: {
          vendorInventoryItemId: 'inventory-1',
          vendorItemId: 'vendor-1',
        },
      }],
    }],
    ...overrides,
  };
}

describe('upsertChannelCatalogBasics identity promotion', () => {
  it('promotes a unique inventory relation on the same option row and returns a media remap', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const tx = {
      channelListing: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{
            id: 'listing-1', externalId: 'P-1', isActive: true,
          }])
          .mockResolvedValueOnce([{ id: 'listing-1', externalId: 'P-1' }])
          .mockResolvedValueOnce([{
            id: 'listing-1',
            externalId: 'P-1',
            masterProductId: 'master-1',
            options: [{ id: 'option-1', externalOptionId: 'vendor-1' }],
          }])
          .mockResolvedValueOnce([{
            id: 'listing-1',
            options: [{ inventoryComponents: [{ masterProductId: 'master-1' }] }],
          }]),
      },
      channelListingOption: {
        findMany: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{
            id: 'option-1',
            externalOptionId: 'inventory-1',
            isActive: true,
            rawJson: { vendorInventoryItemId: 'inventory-1' },
            listing: { externalId: 'P-1' },
          }]),
      },
      $executeRaw: executeRaw,
    };

    const result = await upsertChannelCatalogBasics(tx as never, basicInput());

    expect(result.mappingIdentityChanged).toBe(true);
    expect(result.identityRemaps).toEqual([{
      listingId: 'listing-1',
      oldExternalOptionId: 'inventory-1',
      newExternalOptionId: 'vendor-1',
    }]);
    expect(result.externalOptionIds).toEqual(['vendor-1']);
    expect(result.changes).toMatchObject({ createdSkuCount: 0, updatedSkuCount: 1 });
    expect(result.persistedListings[0]?.options).toEqual([
      { id: 'option-1', externalOptionId: 'vendor-1' },
    ]);
    expect(executeRaw).toHaveBeenCalledTimes(3);
    const promotionSql = executeRaw.mock.calls[1]?.[0];
    expect(Array.isArray(promotionSql) ? promotionSql.join('?') : String(promotionSql))
      .toContain('external_option_id = incoming');
  });

  it('fails closed on two rows sharing the verified inventory relation', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const tx = {
      channelListing: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{ id: 'listing-1', externalId: 'P-1', isActive: true }])
          .mockResolvedValueOnce([{ id: 'listing-1', externalId: 'P-1' }]),
      },
      channelListingOption: {
        findMany: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'option-a', externalOptionId: 'old-a', isActive: true,
              rawJson: { vendorInventoryItemId: 'inventory-1' },
              listing: { externalId: 'P-1' },
            },
            {
              id: 'option-b', externalOptionId: 'old-b', isActive: true,
              rawJson: { vendorInventoryItemId: 'inventory-1' },
              listing: { externalId: 'P-1' },
            },
          ]),
      },
      $executeRaw: executeRaw,
    };

    await expect(upsertChannelCatalogBasics(tx as never, basicInput())).rejects
      .toBeInstanceOf(ConflictException);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('preserves the known vendor identity when the inventory fallback has null vendorItemId', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const tx = {
      channelListing: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{ id: 'listing-1', externalId: 'P-1', isActive: true }])
          .mockResolvedValueOnce([{ id: 'listing-1', externalId: 'P-1' }])
          .mockResolvedValueOnce([{
            id: 'listing-1',
            externalId: 'P-1',
            masterProductId: 'master-1',
            options: [{ id: 'option-1', externalOptionId: 'vendor-1' }],
          }])
          .mockResolvedValueOnce([{
            id: 'listing-1',
            options: [{ inventoryComponents: [{ masterProductId: 'master-1' }] }],
          }]),
      },
      channelListingOption: {
        findMany: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{
            id: 'option-1',
            externalOptionId: 'vendor-1',
            isActive: true,
            rawJson: {
              vendorItemId: 'vendor-1',
              vendorInventoryItemId: 'inventory-1',
              externalOptionIdentitySource: 'vendor_item',
            },
            listing: { externalId: 'P-1' },
          }]),
      },
      $executeRaw: executeRaw,
    };

    const result = await upsertChannelCatalogBasics(tx as never, basicInput({
      products: [{
        ...basicInput().products[0],
        options: [{
          ...basicInput().products[0].options[0],
          externalOptionId: 'inventory-1',
          raw: { vendorInventoryItemId: 'inventory-1', vendorItemId: null },
        }],
      }],
    }));

    expect(result.identityRemaps).toEqual([]);
    expect(result.externalOptionIds).toEqual(['vendor-1']);
    const optionPayload = jsonArrayParameter(executeRaw.mock.calls[1]);
    expect(optionPayload[0]).toEqual(expect.objectContaining({ externalOptionId: 'vendor-1' }));
    expect(optionPayload[0]?.rawJson).toEqual(expect.objectContaining({
      vendorItemId: null,
      vendorInventoryItemId: 'inventory-1',
      externalOptionIdentitySource: 'vendor_item',
    }));
  });

  it('fails before option writes when two incoming plans resolve one row to different IDs', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const tx = {
      channelListing: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{ id: 'listing-1', externalId: 'P-1', isActive: true }])
          .mockResolvedValueOnce([{ id: 'listing-1', externalId: 'P-1' }]),
      },
      channelListingOption: {
        findMany: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{
            id: 'option-1',
            externalOptionId: 'vendor-1',
            isActive: true,
            rawJson: { vendorItemId: 'vendor-1', vendorInventoryItemId: 'inventory-1' },
            listing: { externalId: 'P-1' },
          }]),
      },
      $executeRaw: executeRaw,
    };
    const product = basicInput().products[0]!;

    await expect(upsertChannelCatalogBasics(tx as never, basicInput({
      products: [{
        ...product,
        options: [
          product.options[0]!,
          { ...product.options[0]!, externalOptionId: 'another-vendor', raw: {
            vendorInventoryItemId: 'inventory-1',
            vendorItemId: 'vendor-1',
          } },
        ],
      }],
    }))).rejects.toBeInstanceOf(ConflictException);
    // The listing insert is allowed; no identity remap or option upsert may run.
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });
});

function detailInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId,
    channelAccountId,
    lastImportRunId: runId,
    rawSource: 'coupang_catalog_details',
    products: [{
      externalProductId: 'P-1',
      documents: [
        { id: 'new-a', kind: 'contents', value: 'new contents' },
        { id: 'empty-b', kind: 'contents', value: [] },
      ],
      raw: { providerNull: null },
      options: [
        {
          externalOptionId: 'new-vendor-option',
          sellerProductItemId: 'inventory-a',
          externalVendorSku: 'new-sku',
          barcode: 'new-barcode',
          modelNumber: 'new-model',
          attributes: [{ type: '색상', value: '빨강' }],
          documentIds: ['new-a'],
          raw: { providerField: null },
        },
        {
          externalOptionId: 'option-b',
          vendorItemId: null,
          externalVendorSku: null,
          barcode: '',
          modelNumber: null,
          attributes: [],
          documentIds: ['empty-b'],
          raw: { anotherProviderField: null },
        },
      ],
    }],
    ...overrides,
  };
}

function detailTransaction() {
  const executeRaw = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
  const listingRows = [{
    id: 'listing-1',
    externalId: 'P-1',
    isActive: true,
    rawJson: {
      detailDocuments: [
        { id: 'old-a', kind: 'contents', value: 'old A' },
        { id: 'old-b', kind: 'contents', value: 'old B' },
        { id: 'notice-1', kind: 'notices', value: ['notice'] },
        { id: 'notice-duplicate', kind: 'notices', value: ['notice'] },
      ],
    },
  }];
  const optionRows = [
    {
      id: 'option-a',
      externalOptionId: 'option-a-inventory',
      rawJson: {
        vendorInventoryItemId: 'inventory-a',
        detailDocumentIds: ['old-a', 'notice-duplicate'],
      },
      listing: { externalId: 'P-1' },
    },
    {
      id: 'option-b',
      externalOptionId: 'option-b',
      rawJson: {
        vendorInventoryItemId: 'inventory-b',
        externalOptionIdentitySource: 'inventory_item',
        detailDocumentIds: ['old-b', 'notice-1'],
      },
      listing: { externalId: 'P-1' },
    },
  ];
  const tx = {
    channelListing: {
      findMany: vi.fn()
        .mockResolvedValueOnce(listingRows)
        .mockResolvedValueOnce([{
          id: 'listing-1',
          externalId: 'P-1',
          masterProductId: 'master-1',
          options: [
            { id: 'option-a', externalOptionId: 'option-a-inventory' },
            { id: 'option-b', externalOptionId: 'option-b' },
          ],
        }])
        .mockResolvedValueOnce([{
          id: 'listing-1',
          options: [{ inventoryComponents: [{ masterProductId: 'master-1' }] }],
        }]),
    },
    channelListingOption: {
      findMany: vi.fn()
        .mockResolvedValueOnce(optionRows)
        .mockResolvedValueOnce([optionRows[1]]),
    },
    $executeRaw: executeRaw,
  };
  return { executeRaw, tx };
}

function jsonArrayParameter(call: unknown[]): Array<Record<string, unknown>> {
  const parameter = call.slice(1).find((value) =>
    typeof value === 'string' && value.startsWith('['));
  if (typeof parameter !== 'string') throw new Error('JSON array SQL parameter missing');
  return JSON.parse(parameter) as Array<Record<string, unknown>>;
}

describe('updateChannelCatalogDetails', () => {
  it('merges documents per option and kind, deduplicates the pool, and preserves old refs for empty observations', async () => {
    const { executeRaw, tx } = detailTransaction();

    const result = await updateChannelCatalogDetails(tx as never, detailInput());

    expect(result.persistedListings).toEqual([{
      id: 'listing-1',
      externalProductId: 'P-1',
      masterProductId: 'master-1',
      options: [
        { id: 'option-a', externalOptionId: 'option-a-inventory' },
        { id: 'option-b', externalOptionId: 'option-b' },
      ],
    }]);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(result.identityRemaps).toEqual([{
      listingId: 'listing-1',
      oldExternalOptionId: 'new-vendor-option',
      newExternalOptionId: 'option-a-inventory',
    }]);

    const listingPayload = jsonArrayParameter(executeRaw.mock.calls[0]);
    const detailDocuments = listingPayload[0]?.rawJson as {
      detailDocuments: Array<{ id: string; kind: string; value: unknown }>;
    };
    expect(detailDocuments.detailDocuments).toEqual([
      { id: 'old-b', kind: 'contents', value: 'old B' },
      { id: 'notice-1', kind: 'notices', value: ['notice'] },
      { id: 'new-a', kind: 'contents', value: 'new contents' },
      { id: 'empty-b', kind: 'contents', value: [] },
    ]);

    const optionPayload = jsonArrayParameter(executeRaw.mock.calls[1]);
    expect((optionPayload.find((row) => row.id === 'option-a')?.rawJson as Record<string, unknown>)
      .detailDocumentIds).toEqual(['notice-1', 'new-a']);
    expect((optionPayload.find((row) => row.id === 'option-b')?.rawJson as Record<string, unknown>)
      .detailDocumentIds).toEqual(['old-b', 'notice-1']);
    expect(optionPayload.find((row) => row.id === 'option-b')).toEqual(expect.objectContaining({
      hasModelNumber: false,
      hasBarcode: false,
      hasSellerSku: false,
    }));
    expect(optionPayload.find((row) => row.id === 'option-b')?.rawJson).toEqual(expect.objectContaining({
      anotherProviderField: null,
      vendorItemId: null,
      detailDocumentIds: ['old-b', 'notice-1'],
    }));
  });

  it('fails closed when an incoming exact identity collides with another listing', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const option = {
      id: 'option-a',
      externalOptionId: 'option-a-inventory',
      rawJson: { vendorInventoryItemId: 'inventory-a' },
      listing: { externalId: 'P-1' },
    };
    const tx = {
      channelListing: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{
            id: 'listing-1', externalId: 'P-1', isActive: true, rawJson: {},
          }])
          .mockResolvedValueOnce([{
            id: 'listing-1', externalId: 'P-1', masterProductId: null,
            options: [{ id: 'option-a', externalOptionId: 'option-a-inventory' }],
          }]),
      },
      channelListingOption: {
        findMany: vi.fn()
          .mockResolvedValueOnce([option])
          .mockResolvedValueOnce([{
            id: 'other-option',
            externalOptionId: 'new-vendor-option',
            rawJson: { vendorItemId: 'elsewhere' },
            listing: { externalId: 'P-OTHER' },
          }]),
      },
      $executeRaw: executeRaw,
    };

    await expect(updateChannelCatalogDetails(tx as never, detailInput())).rejects
      .toBeInstanceOf(ConflictException);
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
