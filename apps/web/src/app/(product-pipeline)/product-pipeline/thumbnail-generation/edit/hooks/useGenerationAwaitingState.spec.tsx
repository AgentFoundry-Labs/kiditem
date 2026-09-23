import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ThumbnailJobView } from '../../../_shared/hooks/useThumbnailJobs';
import { useGenerationAwaitingState } from './useGenerationAwaitingState';

function job(overrides: Partial<ThumbnailJobView>): ThumbnailJobView {
  return {
    id: 'generation-1',
    contentWorkspaceId: 'workspace-direct',
    status: 'pending',
    method: 'generate',
    prompt: null,
    errorMessage: null,
    attemptCount: 0,
    createdAt: '2026-05-18T00:00:00.000Z',
    updatedAt: '2026-05-18T00:00:00.000Z',
    candidates: [],
    adoptedCandidate: null,
    workspace: { id: 'workspace-direct', salesProductId: null, name: '직접 업로드', imageUrl: 'https://example.com/input.jpg' },
    ...overrides,
  };
}

describe('useGenerationAwaitingState', () => {
  it('uses a directly fetched job when the ownerless row is absent from the list query', () => {
    const directUploadJob = job({ id: 'direct-upload-generation', status: 'pending' });

    const { result } = renderHook(() =>
      useGenerationAwaitingState('direct-upload-generation', [], directUploadJob),
    );

    expect(result.current.targetGen).toBe(directUploadJob);
    expect(result.current.isAwaitingGen).toBe(true);
  });
});
