import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STORAGE_CACHE_CONTROL_PREFIXES,
  buildCopyObjectInput,
  isEligibleStorageObject,
  normalizeStoragePrefix,
  s3CacheControlHeader,
  summarizeStorageObjects,
} from '../storage-cache-control';

describe('storage-cache-control helpers', () => {
  it('normalizes prefixes for recursive storage listing', () => {
    expect(normalizeStoragePrefix('/thumbnail-generations//')).toBe('thumbnail-generations');
    expect(normalizeStoragePrefix(' product-images /')).toBe('product-images');
    expect(() => normalizeStoragePrefix('../secrets')).toThrow(/Invalid storage prefix/);
  });

  it('targets immutable generated image prefixes and skips temporary or non-image objects', () => {
    const prefixes = new Set(DEFAULT_STORAGE_CACHE_CONTROL_PREFIXES);

    expect(
      isEligibleStorageObject(
        {
          key: 'thumbnail-generations/org/image.jpg',
          size: 123,
          contentType: 'image/jpeg',
        },
        prefixes,
      ),
    ).toBe(true);

    expect(
      isEligibleStorageObject(
        {
          key: 'tmp/image-crops/org/crop.png',
          size: 123,
          contentType: 'image/png',
        },
        prefixes,
      ),
    ).toBe(false);

    expect(
      isEligibleStorageObject(
        {
          key: 'product-images/org/manual.pdf',
          size: 123,
          contentType: 'application/pdf',
        },
        prefixes,
      ),
    ).toBe(false);
  });

  it('builds a same-key S3 copy that replaces cache metadata without dropping content metadata', () => {
    const input = buildCopyObjectInput({
      bucket: 'kiditem-staging-assets',
      object: {
        key: 'thumbnail-generations/org/image one.jpg',
        size: 10,
        contentType: 'image/jpeg',
        contentDisposition: 'inline',
        metadata: { source: 'thumbnail' },
      },
      cacheControl: s3CacheControlHeader('31536000'),
    });

    expect(input).toMatchObject({
      Bucket: 'kiditem-staging-assets',
      Key: 'thumbnail-generations/org/image one.jpg',
      CopySource: '/kiditem-staging-assets/thumbnail-generations/org/image%20one.jpg',
      MetadataDirective: 'REPLACE',
      CacheControl: 'public, max-age=31536000, immutable',
      ContentType: 'image/jpeg',
      ContentDisposition: 'inline',
      Metadata: { source: 'thumbnail' },
    });
  });

  it('summarizes eligible object counts and bytes by top-level prefix', () => {
    const summary = summarizeStorageObjects([
      { key: 'thumbnail-generations/a.jpg', size: 100, contentType: 'image/jpeg' },
      { key: 'thumbnail-generations/b.jpg', size: 50, contentType: 'image/jpeg' },
      { key: 'product-images/c.png', size: 25, contentType: 'image/png' },
    ]);

    expect(summary).toEqual([
      { prefix: 'thumbnail-generations', objects: 2, bytes: 150 },
      { prefix: 'product-images', objects: 1, bytes: 25 },
    ]);
  });
});
