import { describe, expect, it } from 'vitest';
import {
  InventorySkuSnapshotItemSchema,
  InventorySkuSnapshotListResponseSchema,
  InventorySkuStockStatusSchema,
  SellpiaMasterActiveStatusSchema,
  SellpiaImportRunListResponseSchema,
} from './inventory-snapshot';

const masterProductId = '00000000-0000-4000-8000-000000000001';
const runId = '00000000-0000-4000-8000-000000000002';

const snapshotItem = {
  masterProductId,
  code: 'SP-001',
  name: '상품',
  optionName: null,
  barcode: null,
  currentStock: 8,
  purchasePrice: 1_000,
  salePrice: null,
  isActive: true,
  stockValue: 8_000,
  lastImportRunId: runId,
  lastImportedAt: '2026-07-12T00:00:00.000Z',
};

describe('InventorySku snapshot contracts', () => {
  it('parses the authoritative inventory snapshot response', () => {
    expect(InventorySkuSnapshotListResponseSchema.parse({
      items: [snapshotItem],
      total: 1,
      page: 1,
      limit: 50,
      summary: {
        totalSkus: 1,
        inStockSkus: 1,
        outOfStockSkus: 0,
        totalUnits: 8,
        pricedAssetValue: 8_000,
        unpricedSkuCount: 0,
      },
      latestImport: {
        id: runId,
        fileName: 'exported-list (3).xls',
        fileHash: 'a'.repeat(64),
        status: 'completed',
        rowCount: 1_964,
        importedAt: '2026-07-12T00:00:00.000Z',
        lastVerifiedAt: '2026-07-12T00:00:00.000Z',
        verificationCount: 1,
        lastTrigger: 'legacy_manual_import',
        freshnessGeneration: null,
        manualFreshExportConfirmedAt: null,
        manualFreshExportConfirmedBy: null,
        qualityReport: null,
        errorCode: null,
        errorMessage: null,
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:00:00.000Z',
      },
    })).toBeDefined();
  });

  it('publishes only the supported stock filters', () => {
    expect(InventorySkuStockStatusSchema.options).toEqual([
      'all',
      'in_stock',
      'out_of_stock',
    ]);
    expect(() => InventorySkuStockStatusSchema.parse('low_stock')).toThrow();
  });

  it('publishes explicit all, active, and inactive membership filters', () => {
    expect(SellpiaMasterActiveStatusSchema.options).toEqual([
      'all',
      'active',
      'inactive',
    ]);
  });

  it('rejects the legacy InventorySku response identity', () => {
    expect(() => InventorySkuSnapshotItemSchema.parse({
      ...snapshotItem,
      masterProductId: undefined,
      code: undefined,
      id: masterProductId,
      sellpiaProductCode: 'SP-001',
    })).toThrow();
  });

  it.each([
    ['currentStock', { currentStock: -1 }],
    ['purchasePrice', { purchasePrice: -1 }],
    ['salePrice', { salePrice: -1 }],
    ['stockValue', { stockValue: -1 }],
  ])('rejects a negative %s', (_field, override) => {
    expect(() => InventorySkuSnapshotItemSchema.parse({
      ...snapshotItem,
      ...override,
    })).toThrow();
  });

  it('keeps nullable prices and requires an unpriced stock value to be null', () => {
    expect(InventorySkuSnapshotItemSchema.parse({
      ...snapshotItem,
      purchasePrice: null,
      salePrice: null,
      stockValue: null,
    })).toMatchObject({
      purchasePrice: null,
      salePrice: null,
      stockValue: null,
    });

    expect(() => InventorySkuSnapshotItemSchema.parse({
      ...snapshotItem,
      purchasePrice: null,
      stockValue: 8_000,
    })).toThrow();
  });

  it('parses nullable pre-download failures and expanded verification provenance', () => {
    const parsed = SellpiaImportRunListResponseSchema.parse({
      items: [{
        id: runId,
        fileName: null,
        fileHash: null,
        status: 'failed',
        rowCount: 0,
        importedAt: null,
        lastVerifiedAt: null,
        verificationCount: 0,
        lastTrigger: 'manual_request',
        freshnessGeneration: '9007199254740993',
        manualFreshExportConfirmedAt: null,
        manualFreshExportConfirmedBy: null,
        qualityReport: null,
        errorCode: 'sellpia_network_failed',
        errorMessage: 'network failed',
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:01:00.000Z',
      }],
      total: 1,
      page: 1,
      limit: 50,
    });

    expect(parsed.items[0]).toMatchObject({
      fileName: null,
      fileHash: null,
      status: 'failed',
      freshnessGeneration: '9007199254740993',
      errorCode: 'sellpia_network_failed',
    });
  });
});
