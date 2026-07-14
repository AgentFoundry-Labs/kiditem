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

const wingRun = {
  ...run,
  sourceType: 'coupang_wing_catalog',
  channelAccountId: '00000000-0000-4000-8000-000000000002',
};

const wingChanges = {
  createdProductCount: 1225,
  updatedProductCount: 0,
  createdSkuCount: 2241,
  updatedSkuCount: 0,
  skippedRowCount: 3,
};

describe('source import contracts', () => {
  it('parses a completed Sellpia full-snapshot result', () => {
    const parsed = SellpiaInventoryImportResponseSchema.parse({
      run,
      duplicate: false,
      changes: {
        createdMasterProductCount: 1964,
        updatedMasterProductCount: 0,
        inactivatedMasterProductCount: 0,
      },
    });
    expect(parsed.run.rowCount).toBe(1964);
  });

  it('requires channel account scope for Wing responses', () => {
    expect(() => CoupangWingCatalogImportResponseSchema.parse({
      run: { ...run, sourceType: 'coupang_wing_catalog' },
      duplicate: false,
      changes: wingChanges,
    })).toThrow();
  });

  it('parses a completed Wing catalog result', () => {
    const parsed = CoupangWingCatalogImportResponseSchema.parse({
      run: wingRun,
      duplicate: false,
      changes: wingChanges,
    });

    expect(parsed.run.channelAccountId).toBe(wingRun.channelAccountId);
  });

  it('rejects Wing responses without a completed imported run', () => {
    expect(() => CoupangWingCatalogImportResponseSchema.parse({
      run: { ...wingRun, status: 'running' },
      duplicate: false,
      changes: wingChanges,
    })).toThrow();
    expect(() => CoupangWingCatalogImportResponseSchema.parse({
      run: { ...wingRun, importedAt: null },
      duplicate: false,
      changes: wingChanges,
    })).toThrow();
  });

  it('rejects nonzero Wing changes for a duplicate import', () => {
    expect(() => CoupangWingCatalogImportResponseSchema.parse({
      run: wingRun,
      duplicate: true,
      changes: { ...wingChanges, updatedSkuCount: 1 },
    })).toThrow();
  });

  it('reports Sellpia source and channel-account errors on their fields', () => {
    const result = SellpiaInventoryImportResponseSchema.safeParse({
      run: wingRun,
      duplicate: false,
      changes: {
        createdMasterProductCount: 0,
        updatedMasterProductCount: 0,
        inactivatedMasterProductCount: 0,
      },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map(({ path, message }) => ({ path, message }))).toEqual([
      {
        path: ['run', 'sourceType'],
        message: 'Sellpia run must use sourceType sellpia_inventory',
      },
      {
        path: ['run', 'channelAccountId'],
        message: 'Sellpia run must not have a channel account',
      },
    ]);
  });

  it('reports Wing source and channel-account errors on their fields', () => {
    const result = CoupangWingCatalogImportResponseSchema.safeParse({
      run,
      duplicate: false,
      changes: wingChanges,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map(({ path, message }) => ({ path, message }))).toEqual([
      {
        path: ['run', 'sourceType'],
        message: 'Wing run must use sourceType coupang_wing_catalog',
      },
      {
        path: ['run', 'channelAccountId'],
        message: 'Wing run requires a channel account',
      },
    ]);
  });

  it('accepts an idempotent duplicate with zero changes', () => {
    const parsed = SellpiaInventoryImportResponseSchema.parse({
      run,
      duplicate: true,
      changes: {
        createdMasterProductCount: 0,
        updatedMasterProductCount: 0,
        inactivatedMasterProductCount: 0,
      },
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
      changes: {
        createdMasterProductCount: 0,
        updatedMasterProductCount: 0,
        inactivatedMasterProductCount: 0,
      },
    })).toThrow();
    expect(() => SellpiaInventoryImportResponseSchema.parse({
      run,
      duplicate: true,
      changes: {
        createdMasterProductCount: 1,
        updatedMasterProductCount: 0,
        inactivatedMasterProductCount: 0,
      },
    })).toThrow();
  });
});
