import { describe, expect, it, vi } from 'vitest';
import { ThumbnailJobReviewController } from '../adapter/in/http/thumbnail-job-review.controller';

describe('ThumbnailJobReviewController identity contract', () => {
  it('rejects the retired masterId query instead of widening the list request', () => {
    const generationService = { findAll: vi.fn() };
    const controller = new ThumbnailJobReviewController(generationService as never);

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
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED', details: { reason: 'FILTER_REMOVED', field: 'masterId' } }));
    expect(generationService.findAll).not.toHaveBeenCalled();
  });

  it('cancels one thumbnail generation through its organization-scoped owner', async () => {
    const generationService = {
      cancelGeneration: vi.fn().mockResolvedValue({
        status: 'cancelled',
        generationId: 'generation-1',
        preserved: false,
      }),
    };
    const controller = new ThumbnailJobReviewController(
      generationService as never,
    );

    await expect(
      controller.cancelGeneration(
        'generation-1',
        { reason: '사용자 요청' },
        'organization-1',
        { id: 'user-1' } as never,
      ),
    ).resolves.toEqual({
      status: 'cancelled',
      generationId: 'generation-1',
      preserved: false,
    });
    expect(generationService.cancelGeneration).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      generationId: 'generation-1',
      actorUserId: 'user-1',
      reason: '사용자 요청',
    });
  });
});
