import type { OperationStatus } from '@kiditem/shared/registration-execution';
import type { ThumbnailExecutionStatus } from '@kiditem/shared/thumbnail-execution';
import {
  thumbnailRegistrationState,
  type ThumbnailRegistrationState,
} from '../components/workspace/thumbnail/thumbnail-workspace-state';

/**
 * 조회 한 번에 보내는 생성 id 수. 서버는 200 개까지 받지만(`ThumbnailExecutionStatusQuerySchema`)
 * uuid 200 개면 query string 이 7KB 를 넘어 100 개씩 나눈다.
 */
const MAX_IDS_PER_READ = 100;

export interface ThumbnailRegistrationFields {
  /** 가장 최근 몰 반영 실행. "확인 중" 에서 다시 보내기 · 반영 안 됨 표시가 이 실행에 한다. */
  registrationExecutionId: string | null;
  /** 그 실행의 상태 그대로. "반영됨으로 표시" 는 올린 뒤 기다리는 `reconciling` 에서만 받는다. */
  registrationExecutionStatus: OperationStatus | null;
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
      registrationExecutionId: latest?.executionId ?? null,
      registrationExecutionStatus: latest?.status ?? null,
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
