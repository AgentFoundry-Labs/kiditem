import { describe, expect, it } from 'vitest';
import type { ContentAssetItem } from '@kiditem/shared/product-content';
import { getGeneratedThumbnailOptions, thumbnailRegistrationState } from './thumbnail-workspace-state';

const aiAsset: ContentAssetItem = {
  id: 'asset-ai',
  contentWorkspaceId: '00000000-0000-4000-8000-000000000001',
  source: 'ai',
  role: 'thumbnail',
  url: 'https://cdn.example.com/generated.jpg',
  label: null,
  sortOrder: 0,
  width: null,
  height: null,
  thumbnailGenerationId: 'job-1',
  isCurrentThumbnail: false,
  createdAt: '2026-09-23T00:00:00.000Z',
};

describe('thumbnail workspace state', () => {
  it('returns only the AI candidates for the results section', () => {
    expect(getGeneratedThumbnailOptions({
      sourceImageUrls: ['https://cdn.example.com/source.jpg'],
      galleryAssets: [aiAsset, { ...aiAsset, id: 'asset-upload', source: 'upload', url: 'https://cdn.example.com/upload.jpg', thumbnailGenerationId: null }],
    })).toEqual([
      { url: 'https://cdn.example.com/generated.jpg', kind: 'generated', assetId: 'asset-ai', generatedGenerationId: 'job-1' },
    ]);
  });

  it('maps the Channels execution status to the screen registration state', () => {
    expect(thumbnailRegistrationState('succeeded')).toBe('registered');
    expect(thumbnailRegistrationState('failed')).toBe('failed');
    expect(thumbnailRegistrationState('executing')).toBe('checking');
    expect(thumbnailRegistrationState('reconciling')).toBe('checking');
    expect(thumbnailRegistrationState('prepared')).toBe('checking');
    expect(thumbnailRegistrationState('cancelled')).toBeNull();
    expect(thumbnailRegistrationState(null)).toBeNull();
    expect(thumbnailRegistrationState(undefined)).toBeNull();
  });
});
