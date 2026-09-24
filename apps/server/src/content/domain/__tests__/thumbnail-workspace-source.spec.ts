import { describe, expect, it } from 'vitest';
import { resolveWorkspaceThumbnailSource } from '../thumbnail-workspace-source';

describe('resolveWorkspaceThumbnailSource', () => {
  it('prefers the workspace source image over candidate images', () => {
    expect(resolveWorkspaceThumbnailSource({
      imageUrl: 'https://cdn.example.com/source.jpg',
      thumbnailUrl: 'https://cdn.example.com/fallback.jpg',
      images: [
        {
          url: 'https://cdn.example.com/primary.jpg',
          role: 'thumbnail',
          sortOrder: 0,
          isPrimary: true,
        },
      ],
    })).toBe('https://cdn.example.com/source.jpg');
  });

  it('falls back to the primary displayable candidate and then thumbnail URL', () => {
    expect(resolveWorkspaceThumbnailSource({
      imageUrl: 'data:image/png;base64,invalid',
      thumbnailUrl: 'https://cdn.example.com/fallback.jpg',
      images: [
        {
          url: '/generated-thumbnails/primary.png',
          role: 'thumbnail',
          sortOrder: 0,
          isPrimary: true,
        },
      ],
    })).toBe('/generated-thumbnails/primary.png');

    expect(resolveWorkspaceThumbnailSource({
      imageUrl: null,
      thumbnailUrl: 'https://cdn.example.com/fallback.jpg',
      images: [],
    })).toBe('https://cdn.example.com/fallback.jpg');
  });
});
