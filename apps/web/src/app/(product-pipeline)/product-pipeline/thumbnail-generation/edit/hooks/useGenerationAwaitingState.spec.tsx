import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';
import { useGenerationAwaitingState } from './useGenerationAwaitingState';

function generation(overrides: Partial<ThumbnailGenerationItem>): ThumbnailGenerationItem {
  return {
    id: 'generation-1',
    createdAt: '2026-05-18T00:00:00.000Z',
    status: 'pending',
    phase: null,
    grade: 'F',
    score: 0,
    contentWorkspaceId: 'workspace-direct',
    sourceCandidateId: null,
    originalUrl: 'https://example.com/input.jpg',
    selectedUrl: null,
    candidates: [],
    method: 'generate',
    editAnalysis: null,
    inputMeta: null,
    contentWorkspace: {
      id: 'workspace-direct',
      name: '직접 업로드',
      imageUrl: 'https://example.com/input.jpg',
      coupangProductId: null,
      category: null,
    },
    ...overrides,
  };
}

describe('useGenerationAwaitingState', () => {
  it('uses a directly fetched generation when the ownerless row is absent from the list query', () => {
    const directUploadGeneration = generation({
      id: 'direct-upload-generation',
      status: 'pending',
    });

    const { result } = renderHook(() =>
      useGenerationAwaitingState('direct-upload-generation', [], directUploadGeneration),
    );

    expect(result.current.targetGen).toBe(directUploadGeneration);
    expect(result.current.isAwaitingGen).toBe(true);
  });
});
