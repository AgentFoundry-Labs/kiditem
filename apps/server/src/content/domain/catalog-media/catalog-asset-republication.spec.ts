import { describe, expect, it } from 'vitest';
import { planCatalogAssetRepublication } from './catalog-asset-republication';

const storage = {
  storageKey: 'catalog/a.jpg',
  mimeType: 'image/jpeg',
  width: 780,
  height: 780,
  fileSize: 4096,
};
const emptyStorage = { storageKey: null, mimeType: null, width: null, height: null, fileSize: null };
const materialization = { materializationStatus: 'ready', materializedAtMs: 100 };
const history = (run: string) => ({
  publicationReference: { type: 'source_import_run', id: run },
  sourceImportRunId: run,
  lastImportRunId: run,
  publicationScope: 'full',
});
const published = (run: string, extra: Record<string, unknown> = {}) => ({
  sourceType: 'channel_catalog',
  channel: 'smartstore',
  sourceUrl: 'https://img.example/a.jpg',
  externalOptionId: null,
  externalOptionIds: [],
  active: true,
  ...history(run),
  ...extra,
});
const stored = (over: Partial<Parameters<typeof planCatalogAssetRepublication>[0]> = {}) => ({
  url: 'https://img.example/a.jpg',
  role: 'primary',
  sortOrder: 0,
  isDeleted: false,
  metadata: { ...published('run-1'), ...materialization, catalogRepresentative: true },
  storage,
  ...over,
});
const observed = (over: Partial<Parameters<typeof planCatalogAssetRepublication>[1]> = {}) => ({
  sourceUrl: 'https://img.example/a.jpg',
  role: 'primary',
  sortOrder: 0,
  publicationMetadata: published('run-2'),
  ...over,
});

describe('planCatalogAssetRepublication', () => {
  it('keeps the stored copy and its materialization keys when the same URL gets a new order', () => {
    expect(
      planCatalogAssetRepublication(stored(), observed({ sortOrder: 3 }), { preservesManualSelection: false }),
    ).toEqual({
      kind: 'update',
      url: 'https://img.example/a.jpg',
      role: 'primary',
      sortOrder: 3,
      storage,
      metadata: { ...published('run-2'), ...materialization, catalogRepresentative: true },
    });
  });

  it('clears the stored copy and materialization keys when the URL changed', () => {
    const plan = planCatalogAssetRepublication(
      stored(),
      observed({
        sourceUrl: 'https://img.example/b.jpg',
        publicationMetadata: published('run-2', { sourceUrl: 'https://img.example/b.jpg' }),
      }),
      { preservesManualSelection: false },
    );
    expect(plan).toEqual({
      kind: 'update',
      url: 'https://img.example/b.jpg',
      role: 'primary',
      sortOrder: 0,
      storage: emptyStorage,
      metadata: {
        ...published('run-2', { sourceUrl: 'https://img.example/b.jpg' }),
        catalogRepresentative: true,
      },
    });
  });

});
