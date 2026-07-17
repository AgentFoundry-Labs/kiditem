import { describe, expect, it } from 'vitest';
import {
  CompletedSourceArtifactRunSchema,
  CoupangWingCatalogImportResponseSchema,
  SellpiaInventoryImportOutcomeSchema,
  SellpiaInventoryImportResponseSchema,
  SourceImportRunSchema,
  SourceImportTypeSchema,
  VerifiedSellpiaSourceImportRunSchema,
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
  lastVerifiedAt: '2026-07-11T00:00:00.000Z',
  verificationCount: 1,
  lastTrigger: 'legacy_manual_import',
  freshnessGeneration: '1',
  manualFreshExportConfirmedAt: null,
  manualFreshExportConfirmedBy: null,
  qualityReport: null,
  errorCode: null,
  errorMessage: null,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
};

const wingRun = {
  ...run,
  sourceType: 'coupang_wing_catalog',
  channelAccountId: '00000000-0000-4000-8000-000000000002',
  lastVerifiedAt: null,
  verificationCount: 0,
  lastTrigger: null,
  freshnessGeneration: null,
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
      outcome: 'published',
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
      run: {
        ...wingRun,
        lastVerifiedAt: run.lastVerifiedAt,
        verificationCount: 1,
      },
      duplicate: false,
      outcome: 'published',
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
      outcome: 'same_hash_verified',
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
      outcome: 'published',
      changes: {
        createdMasterProductCount: 0,
        updatedMasterProductCount: 0,
        inactivatedMasterProductCount: 0,
      },
    })).toThrow();
    expect(() => SellpiaInventoryImportResponseSchema.parse({
      run,
      duplicate: true,
      outcome: 'same_hash_verified',
      changes: {
        createdMasterProductCount: 1,
        updatedMasterProductCount: 0,
        inactivatedMasterProductCount: 0,
      },
    })).toThrow();
  });

  it('allows nullable artifacts only for pre-download Sellpia failures', () => {
    const preDownloadFailure = {
      ...run,
      fileName: null,
      fileHash: null,
      status: 'failed',
      rowCount: 0,
      importedAt: null,
      lastVerifiedAt: null,
      verificationCount: 0,
      freshnessGeneration: '2',
      errorCode: 'sellpia_login_required',
      errorMessage: 'Sellpia login is required',
    };
    expect(SourceImportRunSchema.parse(preDownloadFailure).fileName).toBeNull();
    expect(() => SourceImportRunSchema.parse({
      ...preDownloadFailure,
      status: 'running',
    })).toThrow();
    expect(() => SourceImportRunSchema.parse({
      ...preDownloadFailure,
      sourceType: 'coupang_wing_catalog',
      channelAccountId: wingRun.channelAccountId,
    })).toThrow();
    expect(() => SourceImportRunSchema.parse({
      ...preDownloadFailure,
      fileName: 'download.xls',
    })).toThrow();
    expect(() => SourceImportRunSchema.parse({
      ...preDownloadFailure,
      importedAt: run.importedAt,
    })).toThrow();
  });

  it('rejects impossible state on null-artifact pre-download failures', () => {
    const preDownloadFailure = {
      ...run,
      channelAccountId: null,
      fileName: null,
      fileHash: null,
      status: 'failed',
      rowCount: 0,
      importedAt: null,
      lastVerifiedAt: null,
      verificationCount: 0,
      freshnessGeneration: '2',
      manualFreshExportConfirmedAt: null,
      manualFreshExportConfirmedBy: null,
      qualityReport: null,
      errorCode: 'sellpia_login_required',
      errorMessage: 'Sellpia login is required',
    };
    const invalidRuns = [
      { ...preDownloadFailure, rowCount: 1 },
      { ...preDownloadFailure, lastVerifiedAt: run.lastVerifiedAt },
      { ...preDownloadFailure, verificationCount: 1 },
      {
        ...preDownloadFailure,
        qualityReport: {
          issues: [{
            code: 'missing_name',
            severity: 'warning',
            count: 1,
            sampleRowNumbers: [2],
            sampleProductCodes: ['P-100'],
          }],
        },
      },
      {
        ...preDownloadFailure,
        manualFreshExportConfirmedAt: run.importedAt,
      },
      {
        ...preDownloadFailure,
        manualFreshExportConfirmedBy: '00000000-0000-4000-8000-000000000003',
      },
      {
        ...preDownloadFailure,
        channelAccountId: wingRun.channelAccountId,
      },
      { ...preDownloadFailure, errorCode: 'human readable error' },
      { ...preDownloadFailure, errorCode: null },
      { ...preDownloadFailure, errorMessage: null },
    ];

    expect(invalidRuns.map((value) => SourceImportRunSchema.safeParse(value).success))
      .toEqual(Array.from({ length: invalidRuns.length }, () => false));
  });

  it('requires completed artifact and verified Sellpia provenance', () => {
    expect(CompletedSourceArtifactRunSchema.parse(wingRun).fileHash).toBe(wingRun.fileHash);
    expect(() => CompletedSourceArtifactRunSchema.parse({
      ...wingRun,
      fileHash: null,
    })).toThrow();
    expect(() => CompletedSourceArtifactRunSchema.parse({
      ...wingRun,
      importedAt: null,
    })).toThrow();

    expect(VerifiedSellpiaSourceImportRunSchema.parse(run).verificationCount).toBe(1);
    expect(() => VerifiedSellpiaSourceImportRunSchema.parse({
      ...run,
      lastVerifiedAt: null,
    })).toThrow();
    expect(() => VerifiedSellpiaSourceImportRunSchema.parse({
      ...run,
      verificationCount: 0,
    })).toThrow();
  });

  it('keeps exact import outcomes and source binding literals', () => {
    for (const outcome of [
      'published',
      'same_hash_verified',
      'same_hash_confirmation_scheduled',
    ] as const) {
      expect(SellpiaInventoryImportOutcomeSchema.parse(outcome)).toBe(outcome);
    }
    expect(SourceImportTypeSchema.parse('coupang_rocket_po_catalog')).toBe(
      'coupang_rocket_po_catalog',
    );
  });
});
