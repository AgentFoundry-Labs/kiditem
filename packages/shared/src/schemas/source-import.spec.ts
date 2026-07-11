import { describe, expect, it } from 'vitest';
import {
  CoupangWingCatalogImportResponseSchema,
  SellpiaInventoryImportResponseSchema,
  SourceImportRunSchema,
} from './source-import';

const run = {
  id: '00000000-0000-4000-8000-000000000001',
  sourceType: 'sellpia_inventory',
  channelAccountId: null,
  fileName: 'exported-list (3).xls',
  fileHash: 'a'.repeat(64),
  status: 'completed',
  rowCount: 1964,
  importedAt: '2026-07-11T00:00:00.000Z',
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
};

describe('source import contracts', () => {
  it('parses a completed Sellpia full-snapshot result', () => {
    const parsed = SellpiaInventoryImportResponseSchema.parse({
      run,
      duplicate: false,
      changes: { createdSkuCount: 1964, updatedSkuCount: 0, zeroedSkuCount: 0 },
    });
    expect(parsed.run.rowCount).toBe(1964);
  });

  it('requires channel account scope for Wing responses', () => {
    expect(() => CoupangWingCatalogImportResponseSchema.parse({
      run: { ...run, sourceType: 'coupang_wing_catalog' },
      duplicate: false,
      changes: {
        createdProductCount: 1225,
        updatedProductCount: 0,
        createdSkuCount: 2241,
        updatedSkuCount: 0,
        skippedRowCount: 3,
      },
    })).toThrow();
  });

  it('accepts an idempotent duplicate with zero changes', () => {
    const parsed = SellpiaInventoryImportResponseSchema.parse({
      run,
      duplicate: true,
      changes: { createdSkuCount: 0, updatedSkuCount: 0, zeroedSkuCount: 0 },
    });
    expect(parsed.duplicate).toBe(true);
  });

  it('rejects a malformed SHA-256 hash', () => {
    expect(() => SourceImportRunSchema.parse({ ...run, fileHash: 'short' })).toThrow();
  });

  it('rejects a non-completed success response and nonzero duplicate changes', () => {
    expect(() => SellpiaInventoryImportResponseSchema.parse({
      run: { ...run, status: 'running', importedAt: null },
      duplicate: false,
      changes: { createdSkuCount: 0, updatedSkuCount: 0, zeroedSkuCount: 0 },
    })).toThrow();
    expect(() => SellpiaInventoryImportResponseSchema.parse({
      run,
      duplicate: true,
      changes: { createdSkuCount: 1, updatedSkuCount: 0, zeroedSkuCount: 0 },
    })).toThrow();
  });
});
