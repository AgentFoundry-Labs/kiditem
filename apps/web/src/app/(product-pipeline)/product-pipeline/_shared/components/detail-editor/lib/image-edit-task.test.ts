import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ImageEditPollingCancelledError,
  cancelImageEditTask,
  pollImageEditTaskResult,
} from './image-edit-task';
import { apiClient } from '@/lib/api-client';

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: apiGet,
    post: apiPost,
  },
}));

describe('image edit task client helpers', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
  });

  it('posts direct image edit task cancellation to the task endpoint', async () => {
    apiPost.mockResolvedValueOnce({
      status: 'cancelled',
      jobId: 'image-job-1',
      operationKey: 'image-edit:image-job-1',
      preserved: false,
    });

    await cancelImageEditTask('image-job-1', '사용자 요청');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/image-ai/tasks/image-job-1/cancel',
      { reason: '사용자 요청' },
    );
  });

  it('stops polling when the caller aborts the task', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      pollImageEditTaskResult('image-job-1', {
        signal: controller.signal,
        sleep: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(ImageEditPollingCancelledError);
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
