import type {
  SellpiaInventoryCollectionFailureCode,
} from '@kiditem/shared/sellpia-inventory-freshness';
import {
  collectSellpiaInventory as collectSellpiaInventoryCommand,
  detectOrderCollectionExtensionId,
  sendToExtension,
} from './extension-bridge';

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

function decodeWorkbook(
  encoded: string,
  fileName: string,
  mimeType: string,
  expectedSize: number,
): File {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.byteLength !== expectedSize) {
    throw new SellpiaInventoryExtensionError(
      'Sellpia workbook byte length did not match the extension reply.',
      'unknown',
      'sellpia_invalid_workbook',
    );
  }
  return new File([bytes], fileName, { type: mimeType });
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
  const extensionId = await detectOrderCollectionExtensionId(1_200, null);
  if (!extensionId) {
    throw new SellpiaInventoryExtensionError(
      'KidItem 주문수집 확장프로그램을 찾을 수 없습니다.',
      'extension_missing',
      'sellpia_network_failed',
    );
  }

  const ping = await sendToExtension<{
    success?: boolean;
    capabilities?: Record<string, unknown>;
  }>(extensionId, { action: 'ping' }, 1_200).catch(() => null);
  if (!ping?.success) {
    throw new SellpiaInventoryExtensionError(
      'KidItem 주문수집 확장프로그램이 응답하지 않습니다.',
      'extension_missing',
      'sellpia_network_failed',
    );
  }
  if (ping.capabilities?.collectSellpiaInventory !== true) {
    throw new SellpiaInventoryExtensionError(
      'Sellpia 재고 수집을 지원하는 최신 확장프로그램이 필요합니다.',
      'extension_outdated',
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
    file: decodeWorkbook(
      reply.workbookBase64,
      reply.fileName,
      reply.mimeType,
      reply.size,
    ),
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
