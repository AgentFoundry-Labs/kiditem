import {
  collectSellpiaInventory as collectSellpiaInventoryCommand,
  detectOrderCollectionExtensionId,
  sendToExtension,
} from './extension-bridge';
import type {
  SellpiaInventoryCollectionFailureCode,
} from '@kiditem/shared/sellpia-inventory-freshness';

type BrowserCollectionAttentionReason =
  | 'extension_missing'
  | 'extension_outdated'
  | 'marketplace_login'
  | 'background_timeout'
  | 'unknown';

export class SellpiaInventoryExtensionError extends Error {
  constructor(
    message: string,
    readonly reason: BrowserCollectionAttentionReason,
    readonly failureCode: SellpiaInventoryCollectionFailureCode,
  ) {
    super(message);
    this.name = 'SellpiaInventoryExtensionError';
  }
}

export type CollectedSellpiaInventory = {
  extensionId: string;
  file: File;
};

function snapshotFile(snapshot: object): File {
  return new File(
    [JSON.stringify(snapshot)],
    'sellpia-inventory-snapshot-v1.json',
    { type: 'application/json' },
  );
}

function isServiceWorkerCommunicationRestart(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /message port closed|receiving end does not exist|extension context invalidated|could not establish connection/i.test(
    message,
  );
}

export async function collectSellpiaInventory({
  runId,
}: {
  runId: string;
}): Promise<CollectedSellpiaInventory> {
  const extensionId = await detectOrderCollectionExtensionId(
    1_200,
    'collectSellpiaInventoryJsonV1',
  );
  if (!extensionId) {
    const compatibleExtensionId = await detectOrderCollectionExtensionId(1_200, null);
    if (compatibleExtensionId) {
      throw new SellpiaInventoryExtensionError(
        'Sellpia 재고 수집을 지원하는 최신 확장프로그램이 필요합니다. Chrome 확장 관리에서 extensions/order-collector 를 새로고침해주세요.',
        'extension_outdated',
        'sellpia_network_failed',
      );
    }
    throw new SellpiaInventoryExtensionError(
      'KidItem 주문수집 확장프로그램을 찾을 수 없습니다.',
      'extension_missing',
      'sellpia_network_failed',
    );
  }

  let reply;
  try {
    reply = await collectSellpiaInventoryCommand(extensionId, runId);
  } catch (error) {
    if (!isServiceWorkerCommunicationRestart(error)) throw error;
    reply = await collectSellpiaInventoryCommand(extensionId, runId);
  }
  if (!reply.success) {
    const reason = reply.errorCode === 'sellpia_login_required'
      ? 'marketplace_login'
      : reply.errorCode === 'sellpia_background_timeout'
        ? 'background_timeout'
        : 'unknown';
    throw new SellpiaInventoryExtensionError(
      reply.error,
      reason,
      reply.errorCode,
    );
  }

  return {
    extensionId,
    file: snapshotFile(reply.snapshot),
  };
}

export async function finalizeSellpiaInventorySession(
  run: { extensionId: string; runId: string },
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

export async function cancelSellpiaInventorySession(
  run: { extensionId?: string; runId: string },
): Promise<void> {
  const extensionId = run.extensionId
    ?? await detectOrderCollectionExtensionId(1_200, null);
  if (!extensionId) return;
  await sendToExtension(extensionId, {
    action: 'cancelCollectionSession',
    runId: run.runId,
  });
}
