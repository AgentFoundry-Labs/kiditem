import { describe, expect, it } from 'vitest';
import {
  buildThumbnailSourceOptions,
  getGeneratedThumbnailOptions,
  thumbnailRegistrationState,
  type ThumbnailWorkspaceGeneration,
} from './thumbnail-workspace-state';

const readyGeneration: ThumbnailWorkspaceGeneration = {
  id: 'generation-ready',
  status: 'succeeded',
  phase: 'ready',
  registrationStatus: null,
  registrationError: null,
  candidates: [{ id: 'candidate-1', url: 'https://cdn.example.com/generated.jpg' }],
};

describe('thumbnail workspace state', () => {
  it('builds source options from source images and generated results without duplicates', () => {
    expect(buildThumbnailSourceOptions({
      sourceImageUrls: ['https://cdn.example.com/source.jpg'],
      generations: [
        readyGeneration,
        {
          ...readyGeneration,
          id: 'generation-duplicate',
          candidates: [{ id: 'candidate-2', url: 'https://cdn.example.com/source.jpg' }],
        },
      ],
    })).toEqual([
      {
        url: 'https://cdn.example.com/source.jpg',
        kind: 'source',
        generatedGenerationId: null,
        generatedCandidateId: null,
      },
      {
        url: 'https://cdn.example.com/generated.jpg',
        kind: 'generated',
        generatedGenerationId: 'generation-ready',
        generatedCandidateId: 'candidate-1',
      },
    ]);
  });

  it('returns generated thumbnail options only for the results section', () => {
    expect(getGeneratedThumbnailOptions({
      sourceImageUrls: ['https://cdn.example.com/source.jpg'],
      generations: [readyGeneration],
    })).toEqual([
      {
        url: 'https://cdn.example.com/generated.jpg',
        kind: 'generated',
        generatedGenerationId: 'generation-ready',
        generatedCandidateId: 'candidate-1',
      },
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
