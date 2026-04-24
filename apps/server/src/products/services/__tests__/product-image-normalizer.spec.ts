import { describe, expect, it } from 'vitest';
import { normalizeMasterImages } from '../product-image-normalizer';

describe('normalizeMasterImages', () => {
  it('normalizes legacy string arrays', () => {
    expect(normalizeMasterImages(['https://cdn.example.com/a.png'])).toEqual([
      { url: 'https://cdn.example.com/a.png', role: '', label: '', sortOrder: 0 },
    ]);
  });

  it('keeps structured image items and normalizes missing optional text', () => {
    expect(normalizeMasterImages([{ url: 'https://cdn.example.com/a.png', role: 'product', sortOrder: 3 }])).toEqual([
      { url: 'https://cdn.example.com/a.png', role: 'product', label: '', sortOrder: 3 },
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
