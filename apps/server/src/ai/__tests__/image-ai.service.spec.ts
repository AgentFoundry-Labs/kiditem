import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ImageAiService } from '../application/service/image-ai.service';
import type { ImageEditDirectGenerationJobService } from '../application/service/image-edit-direct-generation-job.service';

const ORGANIZATION_ID = 'organization-1';
const USER_ID = 'user-7';

function makeJobs() {
  return {
    schedule: vi.fn().mockResolvedValue({ taskId: 'image-job-1' }),
    getStatus: vi.fn().mockResolvedValue({
      taskId: 'image-job-1',
      status: 'succeeded',
      output: { image_url: 'https://cdn.example.com/out.png' },
      errorCode: null,
      errorMessage: null,
    }),
    cancel: vi.fn().mockResolvedValue({
      status: 'cancelled',
      jobId: 'image-job-1',
      operationKey: 'image-edit:image-job-1',
      preserved: false,
    }),
  } as unknown as ImageEditDirectGenerationJobService & {
    schedule: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
}

function makeService(jobs = makeJobs()) {
  const service = new ImageAiService(jobs);
  return { service, jobs };
}

describe('ImageAiService', () => {
  it('returns a direct image AI job id as taskId', async () => {
    const { service, jobs } = makeService();

    const result = await service.createEditTask(
      { image_url: 'https://example.com/a.png', preset: 'enhance' },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(jobs.schedule).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      triggeredByUserId: USER_ID,
      payload: {
        image_url: 'https://example.com/a.png',
        preset: 'enhance',
        user_prompt: '',
      },
    });
    expect(result).toEqual({ taskId: 'image-job-1' });
  });

  it('forwards color guide image_urls through the direct job payload', async () => {
    const { service, jobs } = makeService();

    await service.createEditTask(
      {
        image_urls: [
          'https://cdn.example.com/red.png',
          'https://cdn.example.com/blue.png',
        ],
        preset: 'color_guide',
        productId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(jobs.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          image_urls: [
            'https://cdn.example.com/red.png',
            'https://cdn.example.com/blue.png',
          ],
          preset: 'color_guide',
          productId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        }),
      }),
    );
  });

  it('omits triggeredByUserId when no actor is known', async () => {
    const { service, jobs } = makeService();

    await service.createEditTask(
      { image_url: 'https://example.com/a.png', preset: 'enhance' },
      ORGANIZATION_ID,
      null,
    );

    expect(jobs.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ triggeredByUserId: null }),
    );
  });

  it('threads editor context without creating an Agent OS run', async () => {
    const { service, jobs } = makeService();

    await service.createEditTask(
      {
        image_url: 'https://example.com/a.png',
        preset: 'custom',
        user_prompt: '밝게',
        productId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        contentGenerationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(jobs.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          productId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          contentGenerationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        }),
      }),
    );
  });

  it('returns direct image AI task status for polling clients', async () => {
    const { service, jobs } = makeService();

    const status = await service.getEditTask(ORGANIZATION_ID, 'image-job-1');

    expect(jobs.getStatus).toHaveBeenCalledWith(ORGANIZATION_ID, 'image-job-1');
    expect(status).toEqual({
      taskId: 'image-job-1',
      status: 'succeeded',
      output: { image_url: 'https://cdn.example.com/out.png' },
      errorCode: null,
      errorMessage: null,
    });
  });

  it('throws 404 when the direct image AI task is unknown', async () => {
    const jobs = makeJobs();
    jobs.getStatus.mockResolvedValueOnce(null);
    const { service } = makeService(jobs);

    await expect(
      service.getEditTask(ORGANIZATION_ID, 'missing-job'),
    ).rejects.toThrow(NotFoundException);
  });

  it('cancels direct image AI tasks without creating an Agent OS cancellation', async () => {
    const { service, jobs } = makeService();

    const result = await service.cancelEditTask(
      ORGANIZATION_ID,
      'image-job-1',
      USER_ID,
      '사용자 요청',
    );

    expect(jobs.cancel).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      taskId: 'image-job-1',
      actorUserId: USER_ID,
      reason: '사용자 요청',
    });
    expect(result).toEqual({
      status: 'cancelled',
      jobId: 'image-job-1',
      operationKey: 'image-edit:image-job-1',
      preserved: false,
    });
  });
});
