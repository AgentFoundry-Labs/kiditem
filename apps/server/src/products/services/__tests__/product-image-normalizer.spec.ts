import { describe, expect, it } from 'vitest';
import { normalizeMasterImages } from '../product-image-normalizer';

describe('normalizeMasterImages', () => {
  it('normalizes legacy string arrays to default role=product, label=null', () => {
    expect(normalizeMasterImages(['https://cdn.example.com/a.png'])).toEqual([
      { url: 'https://cdn.example.com/a.png', role: 'product', label: null, sortOrder: 0 },
    ]);
  });

  it('keeps structured image items and normalizes missing optional text', () => {
    expect(normalizeMasterImages([{ url: 'https://cdn.example.com/a.png', role: 'product', sortOrder: 3 }])).toEqual([
      { url: 'https://cdn.example.com/a.png', role: 'product', label: null, sortOrder: 3 },
    ]);
  });

  it('coerces unknown roles to the default product role', () => {
    expect(
      normalizeMasterImages([{ url: 'https://cdn.example.com/a.png', role: 'legacy-unknown', label: null, sortOrder: 0 }]),
    ).toEqual([
      { url: 'https://cdn.example.com/a.png', role: 'product', label: null, sortOrder: 0 },
    ]);
  });

  it('preserves explicit null labels and string labels', () => {
    expect(
      normalizeMasterImages([
        { url: 'https://cdn.example.com/a.png', role: 'box', label: null, sortOrder: 0 },
        { url: 'https://cdn.example.com/b.png', role: 'detail', label: '상세', sortOrder: 1 },
      ]),
    ).toEqual([
      { url: 'https://cdn.example.com/a.png', role: 'box', label: null, sortOrder: 0 },
      { url: 'https://cdn.example.com/b.png', role: 'detail', label: '상세', sortOrder: 1 },
    ]);
  });

  it('drops invalid image records', () => {
    expect(normalizeMasterImages([null, { url: '' }, 3])).toEqual([]);
  });

  it('returns an empty array for nullish values', () => {
    expect(normalizeMasterImages(null)).toEqual([]);
    expect(normalizeMasterImages(undefined)).toEqual([]);
  });
});
