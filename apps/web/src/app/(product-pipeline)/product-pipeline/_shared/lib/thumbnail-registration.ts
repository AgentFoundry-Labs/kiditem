import type { OperationStatus } from '@kiditem/shared/registration-execution';
import type { ThumbnailExecutionStatus } from '@kiditem/shared/thumbnail-execution';
import {
  thumbnailRegistrationState,
  type ThumbnailRegistrationState,
} from '../components/workspace/thumbnail/thumbnail-workspace-state';

/**
 * 조회 한 번에 보내는 판매상품 id 수. 서버는 200 개까지 받지만(`ThumbnailExecutionStatusQuerySchema`)
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

/**
 * 몰 반영 실행은 (판매상품, 자산) 이 주인이다(KID-313 W3a). 서버는 판매상품마다 가장 최근 실행 하나를 준다 —
 * 그 실행의 자산이 `assetIds` 중 하나일 때만 이 줄의 반영 상태다. 다른 자산을 올린 실행은 이 줄의 것이 아니다.
 */
export function thumbnailRegistrationFor(
  statuses: readonly ThumbnailExecutionStatus[],
  subject: { salesProductId: string | null; assetIds: readonly string[] },
): ThumbnailRegistrationFields {
  const latest = subject.salesProductId
    ? statuses.find((status) => status.salesProductId === subject.salesProductId && subject.assetIds.includes(status.assetId))
    : undefined;
  return {
    registrationExecutionId: latest?.executionId ?? null,
    registrationExecutionStatus: latest?.status ?? null,
    registrationStatus: thumbnailRegistrationState(latest?.status),
    registrationError: latest?.error ?? null,
    registrationCheckedAt: latest?.checkedAt ? String(latest.checkedAt) : null,
  };
}

export function thumbnailExecutionIdChunks(salesProductIds: readonly string[]): string[][] {
  const unique = [...new Set(salesProductIds)];
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += MAX_IDS_PER_READ) {
    chunks.push(unique.slice(index, index + MAX_IDS_PER_READ));
  }
  return chunks;
}
