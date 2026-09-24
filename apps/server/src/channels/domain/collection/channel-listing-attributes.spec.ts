import { describe, expect, it } from 'vitest';
import {
  attributesFromWire,
  mergeAttributesByKind,
  normalizeStoredAttributes,
  type StoredListingAttribute,
} from './channel-listing-attributes';

const purchase = (name: string, value: string, id: string | null = null): StoredListingAttribute =>
  ({ kind: 'purchase', attributeTypeId: id, name, value, exposed: null });
const search = (name: string, value: string): StoredListingAttribute =>
  ({ kind: 'search', attributeTypeId: null, name, value, exposed: null });

describe('normalizeStoredAttributes', () => {
  it('accepts the current shape, converts legacy {type,value} to purchase, and drops the rest', () => {
    expect(normalizeStoredAttributes([
      purchase('색상', '빨강', '123'),
      { type: '사이즈', value: 'M' },
      { junk: true },
      null,
    ])).toEqual([purchase('색상', '빨강', '123'), purchase('사이즈', 'M')]);
  });
  it('treats {} and null written by other owners as no attributes', () => {
    expect(normalizeStoredAttributes({})).toEqual([]);
    expect(normalizeStoredAttributes(null)).toEqual([]);
  });
});

describe('attributesFromWire', () => {
  it('fills the kind from the path and keeps what the source said', () => {
    expect(attributesFromWire([{ type: '색상', value: '빨강', attributeTypeId: '7', exposed: true }], 'purchase'))
      .toEqual([{ kind: 'purchase', attributeTypeId: '7', name: '색상', value: '빨강', exposed: true }]);
    expect(attributesFromWire([{ type: '소재', value: '면', kind: 'search' }], 'purchase'))
      .toEqual([search('소재', '면')]);
  });
});

describe('mergeAttributesByKind', () => {
  it('replaces only the given kind and keeps the other kind from the stored value', () => {
    const stored = [purchase('색상', '빨강'), search('소재', '면')];
    expect(mergeAttributesByKind(stored, [search('소재', '울'), search('계절', '겨울')], ['search']))
      .toEqual([purchase('색상', '빨강'), search('계절', '겨울'), search('소재', '울')]);
    expect(mergeAttributesByKind(stored, [purchase('색상', '파랑', '7')], ['purchase']))
      .toEqual([purchase('색상', '파랑', '7'), search('소재', '면')]);
  });
  it('is order independent across paths: excel then detail equals detail then excel', () => {
    const detail = [purchase('색상', '빨강', '7')];
    const excel = [search('소재', '면')];
    const a = mergeAttributesByKind(mergeAttributesByKind([], excel, ['search']), detail, ['purchase']);
    const b = mergeAttributesByKind(mergeAttributesByKind([], detail, ['purchase']), excel, ['search']);
    expect(a).toEqual(b);
  });
  it('emits one canonical order (kind, attribute type or name, value) whatever order the inputs came in', () => {
    const stored = [search('소재', '면'), purchase('색상', '빨강', '9'), purchase('수량', '1개', '2')];
    expect(mergeAttributesByKind(stored, [search('재질', '면'), search('계절', '겨울')], ['search'])).toEqual([
      purchase('수량', '1개', '2'),
      purchase('색상', '빨강', '9'),
      search('계절', '겨울'),
      search('재질', '면'),
    ]);
  });
  it('ignores incoming entries outside the kinds being replaced and dedupes', () => {
    expect(mergeAttributesByKind([], [search('a', '1'), purchase('b', '2'), search('a', '1')], ['search']))
      .toEqual([search('a', '1')]);
  });
});
