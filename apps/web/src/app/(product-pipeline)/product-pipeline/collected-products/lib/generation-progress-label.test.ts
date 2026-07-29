import { describe, expect, it } from 'vitest';
import {
  getDetailGenerationStage,
  getInlineGenerationProgressLabel,
} from './generation-progress-label';

describe('generation progress labels', () => {
  it('labels image-only optimistic pending rows as image generation', () => {
    expect(
      getInlineGenerationProgressLabel({
        templateLabel: 'KIDITEM DESIGN',
        imageProcessingStatus: 'pending',
        rawInput: { generationMode: 'image' },
      }),
    ).toBe('KIDITEM DESIGN 이미지 생성 중...');
  });

  it('does not claim an untracked copy stage for draft/full pending rows', () => {
    expect(
      getInlineGenerationProgressLabel({
        templateLabel: 'KIDITEM DESIGN',
        imageProcessingStatus: 'pending',
        rawInput: { generationMode: 'draft' },
      }),
    ).toBe('KIDITEM DESIGN 생성 준비 중...');
  });

  it('uses image stage text for image-only progress banners', () => {
    expect(getDetailGenerationStage('pending', 'image')).toBe('AI 이미지 생성 중');
  });

  it('uses a coarse stage while the backend cannot expose internal milestones', () => {
    expect(getDetailGenerationStage('processing', 'full')).toBe('AI 상세페이지 생성 중');
  });
});
