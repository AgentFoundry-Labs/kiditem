import { apiClient } from '@/lib/api-client';
import { extractEditedImageUrl } from './image-edit-result';

export class ImageEditPollingCancelledError extends Error {
  constructor() {
    super('IMAGE_EDIT_POLLING_CANCELLED');
    this.name = 'ImageEditPollingCancelledError';
  }
}

export interface ImageEditTaskInput {
  image_url: string;
  preset: string;
  user_prompt: string;
  productId?: string;
  contentGenerationId?: string;
}

export interface ImageCropInput {
  imageUrl: string;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PollImageEditTaskOptions {
  signal?: AbortSignal;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface ImageEditTaskStatus {
  status: string;
  output?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export async function submitImageEdit(
  params: ImageEditTaskInput,
): Promise<{ taskId: string }> {
  return apiClient.post<{ taskId: string }>('/api/image-ai/edit', params);
}

export async function submitImageCrop(
  params: ImageCropInput,
): Promise<{ imageUrl: string }> {
  return apiClient.post<{ imageUrl: string }>('/api/image-ai/crop', params);
}

export async function cancelImageEditTask(
  taskId: string,
  reason = '사용자 요청',
): Promise<unknown> {
  return apiClient.post(
    `/api/image-ai/tasks/${encodeURIComponent(taskId)}/cancel`,
    { reason },
  );
}

export async function pollImageEditTaskResult(
  taskId: string,
  options: PollImageEditTaskOptions = {},
): Promise<{ image_url: string }> {
  const maxAttempts = options.maxAttempts ?? 180;
  const sleep = options.sleep ?? delay;
  for (let i = 0; i < maxAttempts; i++) {
    throwIfCancelled(options.signal);
    await sleep(2000);
    throwIfCancelled(options.signal);

    let task: ImageEditTaskStatus;
    try {
      task = await apiClient.get<ImageEditTaskStatus>(
        `/api/image-ai/tasks/${encodeURIComponent(taskId)}`,
      );
    } catch {
      continue;
    }
    throwIfCancelled(options.signal);
    if (task.status === 'pending' || task.status === 'running') {
      continue;
    }
    if (task.status === 'failed' || task.status === 'cancelled' || task.status === 'skipped') {
      throw new Error(task.errorMessage || task.errorCode || '이미지 편집에 실패했습니다');
    }
    if (task.status === 'succeeded') {
      const imageUrl = extractEditedImageUrl(task.output ?? null);
      if (!imageUrl) throw new Error('AI 결과 이미지 URL을 찾지 못했습니다');
      return { image_url: imageUrl };
    }
  }
  throw new Error('이미지 편집 결과 확인 시간이 초과되었습니다. 잠시 후 알림에서 결과를 확인해주세요.');
}

export function isImageEditPollingCancelled(
  error: unknown,
): error is ImageEditPollingCancelledError {
  return error instanceof ImageEditPollingCancelledError;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ImageEditPollingCancelledError();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
