import { describe, expect, it, vi } from 'vitest';
import { AiGenerationCancellationService } from '../ai-generation-cancellation.service';

const ORG = '11111111-1111-1111-1111-111111111111';

function makeService() {
  const detailPages = {
    cancelForOperation: vi.fn().mockResolvedValue({
      status: 'cancelled',
      generationId: 'cg-1',
      operationKey: 'detail-page:cg-1',
      preserved: false,
    }),
  };
  const thumbnails = {
    cancelForOperation: vi.fn().mockResolvedValue({
      status: 'cancelled',
      generationId: 'tg-1',
      operationKey: 'thumbnail-edit:tg-1',
      preserved: false,
    }),
  };
  const imageAi = {
    cancelEditTask: vi.fn().mockResolvedValue({
      status: 'cancelled',
      jobId: 'image-job-1',
      operationKey: 'image-edit:image-job-1',
      preserved: false,
    }),
  };
  return {
    detailPages,
    thumbnails,
    imageAi,
    service: new AiGenerationCancellationService(
      detailPages as never,
      thumbnails as never,
      imageAi as never,
    ),
  };
}

describe('AiGenerationCancellationService', () => {
  it('cancels non-terminal ContentGeneration through the detail-page owner service', async () => {
    const { service, detailPages } = makeService();

    const result = await service.cancelContentGeneration({
      organizationId: ORG,
      generationId: 'cg-1',
      actorUserId: 'user-1',
      reason: '사용자 요청',
    });

    expect(detailPages.cancelForOperation).toHaveBeenCalledWith({
      organizationId: ORG,
      generationId: 'cg-1',
      actorUserId: 'user-1',
      reason: '사용자 요청',
    });
    expect(result.status).toBe('cancelled');
  });

  it('cancels non-terminal ThumbnailGeneration through the thumbnail owner service', async () => {
    const { service, thumbnails } = makeService();

    const result = await service.cancelThumbnailGeneration({
      organizationId: ORG,
      generationId: 'tg-1',
      actorUserId: 'user-1',
      reason: '사용자 요청',
    });

    expect(thumbnails.cancelForOperation).toHaveBeenCalledWith({
      organizationId: ORG,
      generationId: 'tg-1',
      actorUserId: 'user-1',
      reason: '사용자 요청',
    });
    expect(result.status).toBe('cancelled');
  });

  it('cancels direct image edit jobs through the image AI owner service', async () => {
    const { service, imageAi } = makeService();

    const result = await service.cancelImageEditJob({
      organizationId: ORG,
      jobId: 'image-job-1',
      actorUserId: 'user-1',
      reason: '사용자 요청',
    });

    expect(imageAi.cancelEditTask).toHaveBeenCalledWith(
      ORG,
      'image-job-1',
      'user-1',
      '사용자 요청',
    );
    expect(result.status).toBe('cancelled');
    expect(result.jobId).toBe('image-job-1');
  });
});
