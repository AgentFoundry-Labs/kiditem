import type { ThumbnailExecutionStatus } from '@kiditem/shared/thumbnail-execution';
import {
  thumbnailRegistrationState,
  type ThumbnailRegistrationState,
} from '../components/workspace/thumbnail/thumbnail-workspace-state';

/** Channels 조회 한 번이 받는 생성 id 수(`ThumbnailExecutionStatusQuerySchema`). */
const MAX_IDS_PER_READ = 200;

export interface ThumbnailRegistrationFields {
  registrationStatus: ThumbnailRegistrationState | null;
  registrationError: string | null;
  registrationCheckedAt: string | null;
}

/** 생성 목록(Content)에 몰 반영 상태(Channels)를 생성 id 로 붙인다. */
export function mergeThumbnailRegistration<T extends { id: string }>(
  generations: readonly T[],
  statuses: readonly ThumbnailExecutionStatus[],
): Array<T & ThumbnailRegistrationFields> {
  const byGeneration = new Map(statuses.map((status) => [status.generationId, status] as const));
  return generations.map((generation) => {
    const latest = byGeneration.get(generation.id);
    return {
      ...generation,
      registrationStatus: thumbnailRegistrationState(latest?.status),
      registrationError: latest?.error ?? null,
      registrationCheckedAt: latest?.checkedAt ? String(latest.checkedAt) : null,
    };
  });
}

export function thumbnailExecutionIdChunks(generationIds: readonly string[]): string[][] {
  const unique = [...new Set(generationIds)];
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += MAX_IDS_PER_READ) {
    chunks.push(unique.slice(index, index + MAX_IDS_PER_READ));
  }
  return chunks;
}
