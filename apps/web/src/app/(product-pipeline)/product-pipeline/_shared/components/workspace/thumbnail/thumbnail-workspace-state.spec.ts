import { describe, expect, it } from 'vitest';
import {
  buildThumbnailSourceOptions,
  classifyProductWingStatus,
  getGeneratedThumbnailOptions,
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
        generatedCandidateId: null,
      },
      {
        url: 'https://cdn.example.com/generated.jpg',
        kind: 'generated',
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
        generatedCandidateId: 'candidate-1',
      },
    ]);
  });

  it('classifies single-product Wing status from applied generation rows', () => {
    expect(classifyProductWingStatus({
      hasContentWorkspace: false,
      generations: [readyGeneration],
    })).toEqual({ kind: 'disabled', label: '상품 등록 후 Wing 업로드 가능' });

    expect(classifyProductWingStatus({
      hasContentWorkspace: true,
      generations: [{
        ...readyGeneration,
        id: 'generation-applied',
        phase: 'applied',
        registrationStatus: null,
      }],
    })).toEqual({
      kind: 'pending',
      label: 'Wing 등록 대기',
      generationId: 'generation-applied',
    });

    expect(classifyProductWingStatus({
      hasContentWorkspace: true,
      generations: [{
        ...readyGeneration,
        id: 'generation-failed',
        phase: 'applied',
        registrationStatus: 'failed',
        registrationError: 'image upload failed',
      }],
    })).toEqual({
      kind: 'failed',
      label: 'Wing 등록 실패',
      generationId: 'generation-failed',
      error: 'image upload failed',
    });

    expect(classifyProductWingStatus({
      hasContentWorkspace: true,
      generations: [{
        ...readyGeneration,
        id: 'generation-registered',
        phase: 'applied',
        registrationStatus: 'registered',
      }],
    })).toEqual({
      kind: 'registered',
      label: 'Wing 등록 완료',
      generationId: 'generation-registered',
    });
  });
});
