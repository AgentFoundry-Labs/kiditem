import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ImageEditPollingCancelledError,
  cancelImageEditTaskAndRecoverResult,
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

  it('recovers a succeeded result when cancellation loses the terminal race', async () => {
    apiPost.mockResolvedValueOnce({
      status: 'already_terminal',
      jobId: 'image-job-1',
      operationKey: 'image-edit:image-job-1',
      preserved: true,
    });
    apiGet.mockResolvedValueOnce({
      status: 'succeeded',
      output: { image_url: 'https://cdn.example.com/edited.png' },
      errorCode: null,
      errorMessage: null,
    });

    await expect(
      cancelImageEditTaskAndRecoverResult('image-job-1', {
        sleep: async () => undefined,
      }),
    ).resolves.toEqual({ image_url: 'https://cdn.example.com/edited.png' });
  });

  it('does not read a result after an effective cancellation', async () => {
    apiPost.mockResolvedValueOnce({
      status: 'cancelled',
      jobId: 'image-job-1',
      operationKey: 'image-edit:image-job-1',
      preserved: false,
    });

    await expect(
      cancelImageEditTaskAndRecoverResult('image-job-1', {
        sleep: async () => undefined,
      }),
    ).resolves.toBeNull();
    expect(apiClient.get).not.toHaveBeenCalled();
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
