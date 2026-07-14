import { describe, expect, it } from 'vitest';
import { resolveOriginalPreviewImage } from './preview-image';

describe('resolveOriginalPreviewImage', () => {
  it('prefers the original URL saved on a restored generation', () => {
    expect(
      resolveOriginalPreviewImage({
        initialGenerationOriginalUrl: 'https://cdn.example.com/generated-original.jpg',
        initialImageUrl: 'https://cdn.example.com/query-image.jpg',
        originalImageUrl: 'https://cdn.example.com/product-image.jpg',
      }),
    ).toBe('https://cdn.example.com/generated-original.jpg');
  });

  it('uses the workspace-bound query image when no product master image exists', () => {
    expect(
      resolveOriginalPreviewImage({
        initialGenerationOriginalUrl: null,
        initialImageUrl: 'https://cdn.example.com/query-image.jpg',
        originalImageUrl: null,
      }),
    ).toBe('https://cdn.example.com/query-image.jpg');
  });
});
