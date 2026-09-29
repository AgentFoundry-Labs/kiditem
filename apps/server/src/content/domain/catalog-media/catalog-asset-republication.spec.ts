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
  publicationReference: { type: 'operation', id: run },
  publicationScope: 'full',
});
/** Keys older publications wrote; stored rows may still carry them. */
const retiredHistory = (run: string) => ({ sourceImportRunId: run, lastImportRunId: run });
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
  it('leaves a row untouched when only the publication history fields differ', () => {
    expect(planCatalogAssetRepublication(stored(), observed(), { preservesManualSelection: false }))
      .toEqual({ kind: 'unchanged' });
  });

  it('leaves a row untouched when it carries run-named keys a new publication no longer writes', () => {
    const legacy = stored({
      metadata: { ...published('run-1'), ...retiredHistory('run-1'), ...materialization, catalogRepresentative: true },
    });
    expect(planCatalogAssetRepublication(legacy, observed(), { preservesManualSelection: false }))
      .toEqual({ kind: 'unchanged' });
  });

  it('drops run-named keys from a row it rewrites', () => {
    const legacy = stored({
      metadata: { ...published('run-1'), ...retiredHistory('run-1'), ...materialization, catalogRepresentative: true },
    });
    const plan = planCatalogAssetRepublication(legacy, observed({ sortOrder: 3 }), { preservesManualSelection: false });
    expect(plan).toMatchObject({
      kind: 'update',
      metadata: { ...published('run-2'), ...materialization, catalogRepresentative: true },
    });
    expect(plan.kind === 'update' && plan.metadata).not.toHaveProperty('lastImportRunId');
    expect(plan.kind === 'update' && plan.metadata).not.toHaveProperty('sourceImportRunId');
  });

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

  it('revives a deleted row even when nothing else changed', () => {
    expect(
      planCatalogAssetRepublication(stored({ isDeleted: true }), observed(), { preservesManualSelection: false }),
    ).toMatchObject({ kind: 'update', storage });
  });

  it('treats a changed role as a change', () => {
    expect(
      planCatalogAssetRepublication(stored({ role: null }), observed(), { preservesManualSelection: false }),
    ).toMatchObject({ kind: 'update', role: 'primary', storage });
  });

  it('treats a changed non-history metadata field as a change', () => {
    expect(
      planCatalogAssetRepublication(
        stored(),
        observed({ publicationMetadata: published('run-2', { externalOptionIds: ['9'], externalOptionId: '9' }) }),
        { preservesManualSelection: false },
      ),
    ).toMatchObject({ kind: 'update' });
  });

  it('keeps an operator-selected row on its own URL and storage while the provider URL moves', () => {
    const manual = stored({
      url: 'https://storage.example/kept.jpg',
      metadata: { ...published('run-1'), ...materialization, operatorNote: 'keep' },
    });
    expect(
      planCatalogAssetRepublication(
        manual,
        observed({ publicationMetadata: published('run-2', { sourceUrl: 'https://img.example/a.jpg' }) }),
        { preservesManualSelection: true },
      ),
    ).toEqual({ kind: 'unchanged' });
    expect(
      planCatalogAssetRepublication(
        manual,
        observed({ sortOrder: 2 }),
        { preservesManualSelection: true },
      ),
    ).toEqual({
      kind: 'update',
      url: 'https://storage.example/kept.jpg',
      role: 'primary',
      sortOrder: 2,
      storage,
      metadata: { ...published('run-2'), ...materialization, operatorNote: 'keep' },
    });
  });

  it('ignores key order and absent-versus-undefined keys when comparing metadata', () => {
    const { active: _active, ...rest } = published('run-1');
    expect(
      planCatalogAssetRepublication(
        stored({ metadata: { catalogRepresentative: true, ...materialization, active: true, ...rest } }),
        observed({ publicationMetadata: { ...published('run-2'), unknownField: undefined } }),
        { preservesManualSelection: false },
      ),
    ).toEqual({ kind: 'unchanged' });
  });
});
