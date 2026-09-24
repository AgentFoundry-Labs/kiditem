import { describe, expect, it } from 'vitest';
import { readThumbnailJobInputs, withThumbnailJobInputs } from './thumbnail-job-input-meta';

describe('thumbnail job input meta', () => {
  it('keeps the request fields and adds the original URL, edit analysis and input photos', () => {
    const meta = withThumbnailJobInputs(
      { mode: 'edit', productGenerationRequestHash: 'hash-1' },
      {
        originalUrl: 'https://cdn.example.com/original.png',
        editAnalysis: { summary: 'crop tighter' },
        inputImages: [
          {
            url: 'https://cdn.example.com/box.png',
            storageKey: 'k/box.png',
            role: 'box',
            label: 'Box',
            sortOrder: 1,
            source: 'workspace_image',
            candidateImageId: 'image-2',
          },
          {
            url: 'https://cdn.example.com/front.png',
            storageKey: null,
            role: 'product',
            label: 'Front',
            sortOrder: 0,
            source: 'prev-gen',
          },
        ],
      },
    );

    expect(meta).toMatchObject({ mode: 'edit', productGenerationRequestHash: 'hash-1' });
    expect(readThumbnailJobInputs(meta)).toEqual({
      originalUrl: 'https://cdn.example.com/original.png',
      editAnalysis: { summary: 'crop tighter' },
      inputImages: [
        {
          url: 'https://cdn.example.com/front.png',
          storageKey: null,
          role: 'product',
          label: 'Front',
          sortOrder: 0,
          source: 'prev_gen',
          sourceRecordImageId: null,
        },
        {
          url: 'https://cdn.example.com/box.png',
          storageKey: 'k/box.png',
          role: 'box',
          label: 'Box',
          sortOrder: 1,
          source: 'hub',
          sourceRecordImageId: 'image-2',
        },
      ],
    });
  });

  it('reads nothing from a missing or malformed meta', () => {
    expect(readThumbnailJobInputs(null)).toEqual({ originalUrl: null, editAnalysis: null, inputImages: [] });
    expect(readThumbnailJobInputs({ inputImages: [{ url: 7 }, 'x'], originalUrl: 3 })).toEqual({
      originalUrl: null,
      editAnalysis: null,
      inputImages: [],
    });
  });

  it('carries the inputs through a re-edit reset that replaces the request fields', () => {
    const first = withThumbnailJobInputs({ mode: 'edit' }, {
      originalUrl: 'https://cdn.example.com/o.png',
      editAnalysis: null,
      inputImages: [{ url: 'https://cdn.example.com/a.png', storageKey: null, role: 'product', label: 'A', sortOrder: 0, source: 'upload' }],
    });
    const reset = withThumbnailJobInputs({ sourceGenerationId: 'job-1', purpose: 'quality' }, readThumbnailJobInputs(first));

    expect(reset).toMatchObject({ sourceGenerationId: 'job-1', purpose: 'quality' });
    expect(readThumbnailJobInputs(reset)).toEqual(readThumbnailJobInputs(first));
  });
});
