import {
  THUMBNAIL_JOB_METHODS,
  THUMBNAIL_JOB_STATUSES,
  type ThumbnailJob,
} from '@kiditem/shared/product-content';

/** job 행 → 공개 `ThumbnailJob`. 저장된 값이 목록 밖이면 상태는 failed, 방법은 edit 으로 읽는다. */
export function toThumbnailJob(row: {
  id: string;
  contentWorkspaceId: string;
  status: string;
  method: string;
  prompt: string | null;
  errorMessage: string | null;
  attemptCount: number;
  createdAt: Date;
  updatedAt: Date;
}): ThumbnailJob {
  return {
    id: row.id,
    contentWorkspaceId: row.contentWorkspaceId,
    status: (THUMBNAIL_JOB_STATUSES as readonly string[]).includes(row.status)
      ? row.status as ThumbnailJob['status']
      : 'failed',
    method: (THUMBNAIL_JOB_METHODS as readonly string[]).includes(row.method)
      ? row.method as ThumbnailJob['method']
      : 'edit',
    prompt: row.prompt,
    errorMessage: row.errorMessage,
    attemptCount: row.attemptCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
