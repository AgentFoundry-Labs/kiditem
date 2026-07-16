import type { SellpiaSendResult } from './order-collection-extension';
import type { StoredOrderCollectionFile } from './order-generated-file-store';

export interface SellpiaOrderTransmissionInput {
  file: StoredOrderCollectionFile;
  extension: {
    sendSellpiaOrders: (input: {
      shopName: string;
      fileName: string;
      blob: Blob;
    }) => Promise<SellpiaSendResult>;
  };
  store: {
    markTransmissionRequested: (
      file: StoredOrderCollectionFile,
      transmissionRequestedAt: number,
    ) => Promise<StoredOrderCollectionFile>;
  };
  freshness: {
    prepareOrderTransmissionIntent: (intentKey: string) => Promise<{
      disposition: 'prepared' | 'already_prepared' | 'already_finalized';
    }>;
    finalizeOrderTransmissionIntent: (intentKey: string) => Promise<unknown>;
    abortOrderTransmissionIntent: (intentKey: string) => Promise<unknown>;
  };
  invalidateFreshnessHistory: () => Promise<void>;
  now?: () => number;
}

export type SellpiaOrderTransmissionResult =
  | { status: 'not_submitted'; abortWarning: boolean }
  | {
      status: 'transmission_requested';
      file: StoredOrderCollectionFile;
      viewRefreshWarning: boolean;
      finalizationWarning: boolean;
      persistenceWarning: boolean;
      shopName: string;
    };

export async function transmitSellpiaOrder(
  input: SellpiaOrderTransmissionInput,
): Promise<SellpiaOrderTransmissionResult> {
  const shopName = input.file.mallName ?? '아이스크림몰';
  let preparation: Awaited<
    ReturnType<SellpiaOrderTransmissionInput['freshness']['prepareOrderTransmissionIntent']>
  >;
  try {
    preparation = await input.freshness.prepareOrderTransmissionIntent(input.file.id);
  } catch {
    throw new Error('전송 준비 상태 저장에 실패해 셀피아 전송을 시작하지 않았습니다.');
  }

  if (preparation.disposition === 'already_prepared') {
    throw new Error(
      '이전 셀피아 전송 결과 확인 필요 — 셀피아 주문 내역을 확인한 뒤 처리하세요.',
    );
  }

  let submittedShopName = shopName;
  let finalizationWarning = false;
  if (preparation.disposition !== 'already_finalized') {
    const extensionResult = await input.extension.sendSellpiaOrders({
      shopName,
      fileName: input.file.fileName,
      blob: input.file.blob,
    });

    if (!extensionResult.success) {
      throw new Error(extensionResult.error ?? '셀피아 전송 요청에 실패했습니다.');
    }
    if (extensionResult.submitted !== true) {
      let abortWarning = false;
      try {
        await input.freshness.abortOrderTransmissionIntent(input.file.id);
      } catch {
        abortWarning = true;
      }
      return { status: 'not_submitted', abortWarning };
    }
    submittedShopName = extensionResult.shop ?? shopName;
    finalizationWarning = !await finalizeWithRetry(input);
  }

  const transmissionRequestedAt = (input.now ?? Date.now)();
  let file: StoredOrderCollectionFile = { ...input.file, transmissionRequestedAt };
  let persistenceWarning = false;
  try {
    file = await input.store.markTransmissionRequested(
      input.file,
      transmissionRequestedAt,
    );
  } catch {
    persistenceWarning = true;
  }

  let viewRefreshWarning = false;
  try {
    await input.invalidateFreshnessHistory();
  } catch {
    viewRefreshWarning = true;
  }

  return {
    status: 'transmission_requested',
    file,
    viewRefreshWarning,
    finalizationWarning,
    persistenceWarning,
    shopName: submittedShopName,
  };
}

async function finalizeWithRetry(
  input: SellpiaOrderTransmissionInput,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await input.freshness.finalizeOrderTransmissionIntent(input.file.id);
      return true;
    } catch {
      // Finalization is idempotent; one immediate retry covers a lost response.
    }
  }
  return false;
}
