import { describe, expect, it } from 'vitest';
import {
  detailSectionUnchanged,
  rawSectionPatch,
  readListingRawSections,
  readOptionRawSections,
} from './channel-listing-raw-sections';

const AT = '2026-09-25T00:00:00.000Z';

describe('readListingRawSections', () => {
  it('reads sections when present', () => {
    const sections = readListingRawSections({
      source: 'coupang_catalog_basics',
      list: { observedAt: AT, modifiedOn: '2026-09-20', createdOn: '2025-01-01', productStatus: 'APPROVED', raw: { a: 1 } },
      detail: { observedAt: AT, documents: [{ id: 'd1', kind: 'contents', value: '<p/>' }], raw: {} },
    });
    expect(sections.list?.modifiedOn).toBe('2026-09-20');
    expect(sections.detail?.documents).toHaveLength(1);
    expect(sections.catalogExcel).toBeNull();
  });

  it('falls back to the flat keys of a row written before sections existed', () => {
    const sections = readListingRawSections({
      source: 'coupang_catalog_details',
      modifiedOn: '2026-09-01',
      createdOn: '2025-01-01',
      detailDocuments: [{ id: 'd1', kind: 'contents', value: 'x' }],
    });
    expect(sections.list).toEqual({
      observedAt: null, modifiedOn: '2026-09-01', createdOn: '2025-01-01', productStatus: null, raw: {},
    });
    expect(sections.detail).toEqual({
      observedAt: null, documents: [{ id: 'd1', kind: 'contents', value: 'x' }], raw: {},
    });
  });

  it('returns no sections for an empty, null or non-object raw', () => {
    for (const raw of [null, undefined, 'x', [], {}]) {
      expect(readListingRawSections(raw)).toEqual({ list: null, detail: null, catalogExcel: null });
    }
  });

  it('rejects a malformed section instead of guessing', () => {
    expect(() => readListingRawSections({ list: { modifiedOn: 3 } })).toThrow();
  });
});

describe('readOptionRawSections', () => {
  it('falls back to flat detailDocumentIds', () => {
    expect(readOptionRawSections({ detailDocumentIds: ['d1'] }).detail).toEqual({
      observedAt: null, documentIds: ['d1'], raw: {},
    });
  });
});

describe('rawSectionPatch', () => {
  it('carries one section plus only the shared flat keys that were given', () => {
    const patch = rawSectionPatch(
      'list',
      { observedAt: AT, modifiedOn: null, createdOn: null, productStatus: null, raw: {} },
      { source: 'coupang_catalog_basics', saleStatus: 'on_sale', createdOn: undefined },
    );
    expect(Object.keys(patch).sort()).toEqual(['list', 'saleStatus', 'source']);
  });

  it('validates the section before it can reach the database', () => {
    expect(() => rawSectionPatch('catalogExcel', { observedAt: AT, row: { 바코드: 1 } } as never)).toThrow();
  });
});

describe('detailSectionUnchanged', () => {
  const documents = [{ id: 'd1', kind: 'contents', value: { b: 2, a: 1 } }];
  it('is true when documents and raw match regardless of key order or observedAt', () => {
    expect(detailSectionUnchanged(
      { observedAt: AT, documents, raw: { y: 1, x: [1, 2] } },
      { documents: [{ id: 'd1', kind: 'contents', value: { a: 1, b: 2 } }], raw: { x: [1, 2], y: 1 } },
    )).toBe(true);
  });
  it('is false when anything differs or nothing is stored', () => {
    expect(detailSectionUnchanged(null, { documents, raw: {} })).toBe(false);
    expect(detailSectionUnchanged({ observedAt: AT, documents, raw: {} }, { documents: [], raw: {} })).toBe(false);
  });
});
