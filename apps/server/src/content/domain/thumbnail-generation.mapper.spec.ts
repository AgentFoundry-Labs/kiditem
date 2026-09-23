import { describe, expect, it } from 'vitest';
import { toThumbnailGenerationItem } from './thumbnail-generation.mapper';

describe('toThumbnailGenerationItem', () => {
  it('describes the generated image only; the mall registration state belongs to Channels', () => {
    const item = toThumbnailGenerationItem({
      id: 'generation-1',
      createdAt: new Date('2026-09-23T00:00:00Z'),
      status: 'succeeded',
      phase: 'applied',
      grade: 'A',
      score: 90,
      contentWorkspaceId: 'workspace-1',
      method: 'edit',
      originalUrl: null,
      selectedUrl: 'http://storage.local/a.png',
      prompt: null,
      editAnalysis: null,
      inputMeta: null,
      errorMessage: null,
      attemptCount: 1,
      triggeredByUserId: null,
      candidates: [{ id: 'c1', url: 'http://storage.local/a.png', storageKey: null, filename: null, sortOrder: 0, mimeType: null, width: null, height: null, fileSize: null }],
      contentWorkspace: { id: 'workspace-1', name: '상품', imageUrl: null, category: null },
    });

    expect(item).toMatchObject({ id: 'generation-1', status: 'succeeded', phase: 'applied', selectedUrl: 'http://storage.local/a.png' });
    expect(Object.keys(item).filter((key) => key.startsWith('registration'))).toEqual([]);
  });
});
