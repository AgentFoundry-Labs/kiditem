import {
  collectSellpiaManualMatch,
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';
import type {
  SellpiaManualMatchCollectionFailureCode,
  SellpiaManualMatchSnapshot,
} from '@kiditem/shared/sellpia-manual-match';

export class SellpiaManualMatchCollectionError extends Error {
  constructor(
    message: string,
    readonly failureCode?: SellpiaManualMatchCollectionFailureCode,
  ) {
    super(message);
    this.name = 'SellpiaManualMatchCollectionError';
  }
}

export type CollectedSellpiaManualMatch = {
  extensionId: string;
  runId: string;
  snapshot: SellpiaManualMatchSnapshot;
};

const FAILURE_MESSAGES: Record<SellpiaManualMatchCollectionFailureCode, string> = {
  sellpia_manual_match_login_required:
    'Sellpia 로그인이 필요합니다. 열린 수동상품매칭 화면에서 로그인한 뒤 다시 시도해 주세요.',
  sellpia_manual_match_contract_drift:
    'Sellpia 수동상품매칭 화면 구조가 변경되어 안전하게 수집을 중단했습니다.',
  sellpia_manual_match_invalid_snapshot:
    'Sellpia 수동상품매칭 결과가 올바르지 않아 저장하지 않았습니다.',
  sellpia_manual_match_timeout:
    'Sellpia 수동상품매칭 근거 수집 시간이 초과되었습니다.',
  sellpia_manual_match_network_failed:
    'Sellpia 수동상품매칭 근거를 수집하지 못했습니다.',
};

export async function collectSellpiaManualMatchSnapshot(
  runId: string,
  targetCodes: string[],
): Promise<CollectedSellpiaManualMatch> {
  const status = await detectOrderCollectionExtensionRuntime(1_200, [
    'browserCollectionSessions',
    'orderCollectionFailureEvidenceV1',
    'collectSellpiaManualMatchV1',
    'collectSellpiaManualMatchPortV1',
  ]);
  if (status.status !== 'ready') {
    const detail = status.status === 'incompatible'
      ? ` 현재 버전 ${status.version}에 필요한 기능이 없습니다: ${status.missingCapabilities.join(', ')}.`
      : '';
    throw new SellpiaManualMatchCollectionError(
      `최신 주문수집 확장프로그램을 찾지 못했습니다.${detail}`,
    );
  }

  const reply = await collectSellpiaManualMatch(
    status.extensionId,
    runId,
    targetCodes,
  );
  if (!reply.success) {
    const stage = typeof reply.stage === 'string' && reply.stage.length <= 160
      ? reply.stage
      : null;
    throw new SellpiaManualMatchCollectionError(
      reply.errorCode === 'sellpia_manual_match_contract_drift'
        ? `${FAILURE_MESSAGES[reply.errorCode]}${stage ? ` (${stage})` : ''}`
        : FAILURE_MESSAGES[reply.errorCode],
      reply.errorCode,
    );
  }
  return {
    extensionId: status.extensionId,
    runId,
    snapshot: reply.snapshot,
  };
}

export async function finalizeSellpiaManualMatchCollection(
  run: Pick<CollectedSellpiaManualMatch, 'extensionId' | 'runId'>,
  status: 'succeeded' | 'failed',
  message: string,
): Promise<void> {
  await sendToExtension(run.extensionId, {
    action: 'finalizeCollectionSession',
    runId: run.runId,
    status,
    message: message.slice(0, 300),
  });
}
