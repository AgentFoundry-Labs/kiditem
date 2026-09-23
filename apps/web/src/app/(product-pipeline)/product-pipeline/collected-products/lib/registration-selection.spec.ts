import { describe, expect, it } from 'vitest';
import type { ContentAssetItem } from '@kiditem/shared/product-content';
import { buildRegistrationThumbnailOptions } from './registration-selection';

const asset = (patch: Partial<ContentAssetItem> & Pick<ContentAssetItem, 'id' | 'url' | 'source'>): ContentAssetItem => ({
  contentWorkspaceId: '00000000-0000-4000-8000-000000000001',
  role: 'thumbnail',
  label: null,
  sortOrder: 0,
  width: null,
  height: null,
  thumbnailGenerationId: null,
  isCurrentThumbnail: false,
  createdAt: '2026-09-23T00:00:00.000Z',
  ...patch,
});

describe('sourcing registration thumbnail selection', () => {
  it('keeps AI candidates visible after the source images and carries every gallery asset id', () => {
    const options = buildRegistrationThumbnailOptions({
      sourceImageUrls: ['https://cdn.example.com/source-a.jpg', 'https://cdn.example.com/source-b.jpg'],
      galleryAssets: [
        asset({ id: 'asset-ai', url: 'https://cdn.example.com/generated-a.jpg', source: 'ai', thumbnailGenerationId: 'job-1' }),
        asset({ id: 'asset-upload', url: 'https://cdn.example.com/source-b.jpg', source: 'upload' }),
      ],
    });

    expect(options).toEqual([
      { url: 'https://cdn.example.com/source-a.jpg', kind: 'source', assetId: null, generatedGenerationId: null },
      { url: 'https://cdn.example.com/source-b.jpg', kind: 'source', assetId: 'asset-upload', generatedGenerationId: null },
      { url: 'https://cdn.example.com/generated-a.jpg', kind: 'generated', assetId: 'asset-ai', generatedGenerationId: 'job-1' },
    ]);
  });

  it('lists an uploaded gallery image that is not among the source images as a source option', () => {
    const options = buildRegistrationThumbnailOptions({
      sourceImageUrls: [],
      galleryAssets: [asset({ id: 'asset-upload', url: 'https://cdn.example.com/upload.jpg', source: 'upload' })],
    });

    expect(options).toEqual([
      { url: 'https://cdn.example.com/upload.jpg', kind: 'source', assetId: 'asset-upload', generatedGenerationId: null },
    ]);
  });
});
