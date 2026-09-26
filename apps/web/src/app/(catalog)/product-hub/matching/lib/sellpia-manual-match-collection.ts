import {
  isOperationTerminal,
  OperationFinishResponseSchema,
  type OperationView,
} from '@kiditem/shared/operation';
import { SELLPIA_MANUAL_MATCH_KIND } from '@kiditem/shared/sellpia-operations';
import type { SellpiaManualMatchSnapshotStatus } from '@kiditem/shared/sellpia-manual-match';
import { COLLECTION_RUNNING_POLL_MS } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { requestOperationStart } from '@/lib/operation-start';
import { attemptFailureText } from '@/lib/operator-error';
import { readSellpiaManualMatchSource } from './channel-sku-matching-api';

/** Channels 기타 kind(사방넷·몰 관리자·셀피아 수동매칭, KID-363)를 도는 확장 빌드가 `ping`에 싣는 표시. */
export const CHANNELS_OPERATION_CAPABILITY = 'channelsOperationKindsV1' as const;
/** 수동매칭 한 번을 기다리는 상한. 대상 2만 개 검색이 이 안에 끝난다(옛 포트 연결은 상한 없이 기다렸다). */
const WAIT_LIMIT_MS = 30 * 60_000;

export class SellpiaManualMatchCollectionError extends Error {
  constructor(message: string, readonly operation: OperationView | null = null) {
    super(message);
    this.name = 'SellpiaManualMatchCollectionError';
  }
}

export type CollectedSellpiaManualMatch = {
  operation: OperationView;
  status: SellpiaManualMatchSnapshotStatus;
};

async function readOperation(operationId: string): Promise<OperationView> {
  return OperationFinishResponseSchema.parse(await apiClient.get(`/api/operations/${encodeURIComponent(operationId)}`)).operation;
}

/**
 * 셀피아 수동상품매칭 근거를 새로 모은다 = 확장에 `channels.sellpia_manual_match` 실행 하나를 시작시키고(KID-363) 그
 * 실행 하나(`GET /api/operations/:id`)를 끝날 때까지 읽는다. 성공이면 게시된 스냅샷 요약을 돌려주고, 실패·중단이면
 * 운영자 문장으로 던진다. 셀피아 로그인을 쓰는 다른 실행이 돌면 확장의 거절 문장을 그대로 던진다.
 */
export async function collectSellpiaManualMatchSnapshot(
  _scope: { organizationId: string },
  options: { sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<CollectedSellpiaManualMatch> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const outcome = await requestOperationStart(SELLPIA_MANUAL_MATCH_KIND, {}, { capability: CHANNELS_OPERATION_CAPABILITY });
  if (outcome.outcome === 'refused') throw new SellpiaManualMatchCollectionError(outcome.message);
  if (!outcome.operationId) {
    throw new SellpiaManualMatchCollectionError('확장 프로그램이 실행 번호를 알려 주지 않았습니다. 잠시 후 다시 시도해 주세요.');
  }
  const deadline = now() + WAIT_LIMIT_MS;
  for (;;) {
    const operation = await readOperation(outcome.operationId);
    if (isOperationTerminal(operation.status)) {
      if (operation.status !== 'succeeded') {
        throw new SellpiaManualMatchCollectionError(
          attemptFailureText(operation, 'sellpia_manual_match') ?? '셀피아 수동상품매칭 근거 수집에 실패했습니다.',
          operation,
        );
      }
      const { currentSnapshot } = await readSellpiaManualMatchSource();
      if (!currentSnapshot) {
        throw new SellpiaManualMatchCollectionError('셀피아 수동상품매칭 완료 결과를 현재 게시 상태와 연결하지 못했습니다.', operation);
      }
      return { operation, status: currentSnapshot };
    }
    if (now() >= deadline) {
      throw new SellpiaManualMatchCollectionError('셀피아 수동상품매칭 수집이 아직 끝나지 않았습니다. 잠시 후 상태를 확인해 주세요.', operation);
    }
    await sleep(COLLECTION_RUNNING_POLL_MS);
  }
}
