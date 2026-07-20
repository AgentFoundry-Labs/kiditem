import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ThumbnailAnalysisGenerationReviewController } from '../adapter/in/http/thumbnail-analysis-generation-review.controller';

describe('ThumbnailAnalysisGenerationReviewController identity contract', () => {
  it('rejects the retired masterId query instead of widening the list request', () => {
    const generationService = { findAll: vi.fn() };
    const controller = new ThumbnailAnalysisGenerationReviewController(generationService as never);

    expect(() =>
      controller.listGenerations(
        'organization-1',
        undefined,
        'legacy-workspace-id',
        undefined,
        undefined,
        undefined,
        undefined,
      ),
    ).toThrow(BadRequestException);
    expect(generationService.findAll).not.toHaveBeenCalled();
  });
});
