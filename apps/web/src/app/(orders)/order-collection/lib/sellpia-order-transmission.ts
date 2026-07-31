import type { SellpiaSendResult } from './order-collection-extension';
import type { StoredOrderCollectionFile } from './order-generated-file-store';

export class SellpiaOrderTransmissionResolutionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SellpiaOrderTransmissionResolutionRequiredError';
  }
}

export interface SellpiaOrderTransmissionInput {
  file: StoredOrderCollectionFile;
  retryConfirmed?: boolean;
  extension: {
    sendSellpiaOrders: (input: {
      shopName: string;
      fileName: string;
      blob: Blob;
      orderNumbers?: string[];
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
    reconcileOrderTransmissionIntent: (input: {
      intentKey: string;
      outcome: 'not_submitted';
      note: string;
    }) => Promise<unknown>;
  };
  invalidateFreshnessHistory: () => Promise<void>;
  onSubmissionConfirmed?: () => void;
  now?: () => number;
}

export type SellpiaOrderTransmissionResult =
  | { status: 'not_submitted'; abortWarning: boolean; error: string | null }
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
  const intentKey = input.file.transmissionIntentKey ?? input.file.id;
  let preparation: Awaited<
    ReturnType<SellpiaOrderTransmissionInput['freshness']['prepareOrderTransmissionIntent']>
  >;
  try {
    preparation = await input.freshness.prepareOrderTransmissionIntent(intentKey);
  } catch {
    throw new Error('전송 준비 상태 저장에 실패해 셀피아 전송을 시작하지 않았습니다.');
  }

  // 로켓/쿠팡직배송은 백엔드가 고정 intent 키(transmissionIntentKey)를 발급하는 불가역 발주라,
  // 미해결 준비 상태(already_prepared)를 하드 블록으로 지켜 중복 전송을 막는다.
  // 일반 몰 파일(키드키즈 등, intent 키 = 파일 고유 id)은 이전 준비가 전송 확증 없이 남은 것뿐이므로
  // (직전 시도의 크래시·불확실 종료) 조작자를 막지 않고 자동으로 미접수 정리 후 다시 준비해 재전송한다.
  // 실제 셀피아 접수 여부는 확장의 주문내역 대조(sellpiaOrderFileUploadEvidenceV1)가 확인한다.
  const hasLocalSubmissionMarker = input.file.transmissionRequestedAt !== undefined;
  const autoRecoverUnfixedIntent =
    input.file.transmissionIntentKey == null
    && preparation.disposition === 'already_prepared'
    && !hasLocalSubmissionMarker;

  if (
    (input.retryConfirmed || autoRecoverUnfixedIntent)
    && preparation.disposition !== 'prepared'
  ) {
    try {
      await input.freshness.reconcileOrderTransmissionIntent({
        intentKey,
        outcome: 'not_submitted',
        note: input.retryConfirmed
          ? '운영자가 셀피아 미접수를 확인하고 재전송을 요청함'
          : '미해결 전송 준비 상태를 자동 정리하고 재전송함(일반 몰 파일)',
      });
      preparation = await input.freshness.prepareOrderTransmissionIntent(intentKey);
    } catch {
      throw new Error(
        '셀피아 재전송 상태 복구에 실패했습니다. 관리자 권한과 기존 접수 상태를 확인해주세요.',
      );
    }
    if (preparation.disposition !== 'prepared') {
      throw new Error('셀피아 재전송 상태를 안전하게 준비하지 못했습니다.');
    }
  }

  // 고정 intent 키(로켓/직배송)의 미해결 준비만 하드 블록으로 남긴다. 일반 몰 파일은 위에서
  // 이미 자동 복구되어 여기 오지 않는다.
  if (preparation.disposition === 'already_prepared' && !hasLocalSubmissionMarker) {
    throw new SellpiaOrderTransmissionResolutionRequiredError(
      '이전 셀피아 전송 결과 확인 필요 — 셀피아 주문 내역을 확인한 뒤 처리하세요.',
    );
  }

  let submittedShopName = shopName;
  let finalizationWarning = false;
  if (preparation.disposition === 'already_prepared') {
    finalizationWarning = !await finalizeWithRetry(input, intentKey);
  } else if (preparation.disposition !== 'already_finalized') {
    const extensionResult = await input.extension.sendSellpiaOrders({
      shopName,
      fileName: input.file.fileName,
      blob: input.file.blob,
      orderNumbers: input.file.orderNumbers,
    });

    if (extensionResult.outcome === 'not_submitted') {
      let abortWarning = false;
      try {
        await input.freshness.abortOrderTransmissionIntent(intentKey);
      } catch {
        abortWarning = true;
      }
      return {
        status: 'not_submitted',
        abortWarning,
        error: extensionResult.error,
      };
    }
    if (extensionResult.outcome === 'unknown') {
      throw new SellpiaOrderTransmissionResolutionRequiredError(
        `셀피아 전송 결과 확인 필요 — 재전송하지 말고 Sellpia 주문 내역을 확인하세요. (${extensionResult.error})`,
      );
    }
    input.onSubmissionConfirmed?.();
    submittedShopName = extensionResult.shop ?? shopName;
    finalizationWarning = !await finalizeWithRetry(input, intentKey);
  }

  const transmissionRequestedAt = input.retryConfirmed
    ? (input.now ?? Date.now)()
    : input.file.transmissionRequestedAt ?? (input.now ?? Date.now)();
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
  intentKey: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await input.freshness.finalizeOrderTransmissionIntent(intentKey);
      return true;
    } catch {
      // Finalization is idempotent; one immediate retry covers a lost response.
    }
  }
  return false;
}
