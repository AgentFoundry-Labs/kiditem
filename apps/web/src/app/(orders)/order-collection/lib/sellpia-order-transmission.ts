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
    requestRefresh: (reason: 'order_transmission_requested') => Promise<unknown>;
  };
  invalidateFreshnessHistory: () => Promise<void>;
  now?: () => number;
}

export type SellpiaOrderTransmissionResult =
  | { status: 'not_submitted' }
  | {
      status: 'transmission_requested';
      file: StoredOrderCollectionFile;
      refreshWarning: boolean;
      persistenceWarning: boolean;
      shopName: string;
    };

export async function transmitSellpiaOrder(
  input: SellpiaOrderTransmissionInput,
): Promise<SellpiaOrderTransmissionResult> {
  const shopName = input.file.mallName ?? '아이스크림몰';
  const extensionResult = await input.extension.sendSellpiaOrders({
    shopName,
    fileName: input.file.fileName,
    blob: input.file.blob,
  });

  if (!extensionResult.success) {
    throw new Error(extensionResult.error ?? '셀피아 전송 요청에 실패했습니다.');
  }
  if (extensionResult.submitted !== true) {
    return { status: 'not_submitted' };
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

  try {
    await input.freshness.requestRefresh('order_transmission_requested');
    await input.invalidateFreshnessHistory();
    return {
      status: 'transmission_requested',
      file,
      refreshWarning: false,
      persistenceWarning,
      shopName: extensionResult.shop ?? shopName,
    };
  } catch {
    return {
      status: 'transmission_requested',
      file,
      refreshWarning: true,
      persistenceWarning,
      shopName: extensionResult.shop ?? shopName,
    };
  }
}
