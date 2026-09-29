import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { downloadBlob } from '@/lib/browser-download';
import { formatNumber } from '@/lib/utils';
import {
  closeOrderActionOperation,
  confirmOrderActionOperation,
  runSellpiaAutoInvoice,
  runSellpiaPostTransfer,
  uploadMallTracking,
} from '@/lib/order-action-operations';
import { isSellpiaProviderMall } from '@kiditem/shared/sellpia-providers';
import {
  MallTrackingUploadMallSchema,
  type MallTrackingUploadMall,
  type MallTrackingUploadResult,
  type SellpiaInvoiceRow,
} from '@kiditem/shared/orders-action-operations';
import { buildIcecreamDeliveryRows } from './icecream-delivery-index';
import {
  buildIcecreamSendFinishFile,
  buildMallTrackingCsvBlob,
  buildMallTrackingPreviewRows,
  filterTrackingByMall,
  type SellpiaTrackingRow,
} from './icecream-tracking-api';
import {
  ICECREAM_MALL_KEY,
  todayYmd,
  type ConversionHistoryItem,
} from './order-collection-page-model';
import { resolveOrderCollectionMallKey } from './order-collection-malls';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';

interface UploadTrackingOptions {
  account: OrderCollectionMallAccount;
  history: ConversionHistoryItem[];
  logError: (title: string, message: string) => void;
  onGeneratedFile?: (artifact: GeneratedTrackingArtifact) => void;
  /** 셀피아 송장 조회 실행 — 행과 그 실행 id(몰 업로드 실행의 원천). */
  collectTracking: () => Promise<{ operationId: string; rows: SellpiaTrackingRow[] }>;
}

interface SellpiaPostProcessOptions {
  logError: (title: string, message: string) => void;
  logInfo?: (title: string, message: string) => void;
  onGeneratedFile?: (artifact: GeneratedTrackingArtifact) => void;
}

export interface GeneratedTrackingArtifact {
  blob: Blob;
  fileName: string;
  mallKey: string;
  mallName: string;
  orderNumbers: string[];
  previewRows: string[][];
  rowCount: number;
}

function generatedTrackingArtifact(options: {
  blob: Blob;
  fileName: string;
  mallKey: string;
  mallName: string;
  rows: SellpiaTrackingRow[];
}): GeneratedTrackingArtifact {
  return {
    blob: options.blob,
    fileName: options.fileName,
    mallKey: options.mallKey,
    mallName: options.mallName,
    orderNumbers: options.rows.map((row) => row.ordNo).filter(Boolean),
    previewRows: buildMallTrackingPreviewRows(options.rows),
    rowCount: options.rows.length,
  };
}

function summarizeOrderNumbers(orderNumbers: string[], limit = 8): string {
  const head = orderNumbers.slice(0, limit).join(', ');
  return orderNumbers.length > limit ? `${head} 외 ${formatNumber(orderNumbers.length - limit)}건` : head;
}

/** 자동송장 실행이 발급한 행 → 송장 CSV 행(수취인·주소는 발급 행에 없다). */
function invoiceTrackingRows(issued: SellpiaInvoiceRow[]): SellpiaTrackingRow[] {
  return issued.map((row) => ({
    ordNo: row.orderNo,
    itemNo: '',
    invNo: row.trackingNumber,
    courier: row.courier,
    provider: '',
  }));
}

/**
 * 몰·셀피아에 제출했지만 확인하지 못한 실행(`reconciling`). 운영자가 화면에서 확인한 대로 토스트의 두 단추로 확인하거나 닫는다
 * — 실행은 그때까지 잠금을 쥐고 남는다.
 */
export function promptOrderActionConfirmation(options: {
  operationId: string;
  message: string;
  confirmLabel: string;
  closeLabel: string;
  closeReason: string;
  /** 바꿔 쓸 진행 중 토스트. */
  toastId?: string | number;
}): void {
  const resolve = async (resolution: 'confirm' | 'close') => {
    try {
      if (resolution === 'confirm') await confirmOrderActionOperation(options.operationId);
      else await closeOrderActionOperation(options.operationId, options.closeReason);
      toast.success(resolution === 'confirm' ? '확인했습니다.' : '닫았습니다.');
    } catch (error) {
      toast.error(friendlyError(error, '확인 결과를 저장하지 못했습니다.') ?? '확인 결과를 저장하지 못했습니다.');
    }
  };
  toast.warning(options.message, {
    ...(options.toastId !== undefined ? { id: options.toastId } : {}),
    duration: Infinity,
    action: { label: options.confirmLabel, onClick: () => { void resolve('confirm'); } },
    cancel: { label: options.closeLabel, onClick: () => { void resolve('close'); } },
  });
}

const INVOICE_NEEDS_CONFIRMATION =
  '셀피아 확인 필요 — 송장번호채번은 눌렀지만 발급된 송장을 읽지 못했습니다. 셀피아 송장 화면에서 발급 여부를 확인해 주세요.';

/**
 * 셀피아 전송 이후 후처리 원클릭(실행 `orders.sellpia_post_transfer` → `orders.sellpia_auto_invoice`, KID-366).
 * 등록 → 자동합포 → 자동재고매칭(비파괴)을 돌리고, 재고매칭이 안 된 주문은 토스트+활동로그로 알린다. 되돌리기 어려운
 * '송장 자동채번'은 서버가 센 대상 수로 사용자 확인을 받은 뒤에만 시작한다(대상은 서버가 정한다 — 최근 24시간 전송분).
 */
export async function runSellpiaPostProcess({
  logError,
  logInfo,
  onGeneratedFile,
}: SellpiaPostProcessOptions): Promise<void> {
  const toastId = toast.loading('셀피아 후처리 중… (등록 → 자동합포 → 자동재고매칭)');
  let outcome: Awaited<ReturnType<typeof runSellpiaPostTransfer>>;
  try {
    outcome = await runSellpiaPostTransfer();
  } catch (err) {
    const message = friendlyError(err) ?? '셀피아 후처리 실패';
    logError('셀피아 후처리', message);
    toast.error(message, { id: toastId, duration: 10000 });
    return;
  }
  if (outcome.status === 'needs_confirmation') {
    logError('셀피아 후처리', '셀피아 확인 필요 — 후처리 결과를 확인하지 못했습니다.');
    promptOrderActionConfirmation({
      operationId: outcome.operationId,
      message: '셀피아 확인 필요 — 후처리 결과를 확인하지 못했습니다. 셀피아 재고매칭 화면을 확인해 주세요.',
      confirmLabel: '완료 확인',
      closeLabel: '안 됨으로 닫기',
      closeReason: '운영자가 셀피아에서 확인: 후처리되지 않음',
      toastId,
    });
    return;
  }

  const result = outcome.result;
  const unmatched = result.unmatchedOrderNumbers;
  toast.success(
    `셀피아 후처리 완료 — 등록 ${result.registered ? '완료' : '확인 못 함'} · 재고매칭 ${result.stockMatched ? '완료' : '확인 못 함'}`
      + ` · 미매칭 ${formatNumber(unmatched.length)}건`,
    { id: toastId, duration: 9000 },
  );

  if (unmatched.length > 0) {
    const summary = summarizeOrderNumbers(unmatched);
    toast.warning(`⚠️ 자동재고매칭 안 된 주문 ${formatNumber(unmatched.length)}건: ${summary}`, {
      duration: 15000,
    });
    logError(`셀피아 미매칭 ${formatNumber(unmatched.length)}건`, summary);
  }

  const invoiceTargetCount = result.invoiceTargetCount;
  if (invoiceTargetCount === 0) {
    toast.warning(
      '이번에 전송한 주문번호를 확인할 수 없어 송장채번을 실행하지 않았습니다. 다른 대기 주문은 선택하지 않았습니다.',
      { duration: 10000 },
    );
    return;
  }

  const confirmed = window.confirm(
    `재고매칭 완료` +
      (unmatched.length > 0 ? `: 미매칭 ${formatNumber(unmatched.length)}건` : '') +
      `\n\n이번 전송 주문 ${formatNumber(invoiceTargetCount)}건만 '송장 자동채번'을 진행할까요?` +
      `\n되돌리기 어려운 작업입니다(실제 송장번호가 발급됩니다).` +
      (unmatched.length > 0 ? '\n미매칭 주문은 채번되지 않습니다.' : ''),
  );
  if (!confirmed) {
    toast.info('송장 자동채번은 진행하지 않았습니다. 재고매칭까지 완료되었습니다.', { duration: 8000 });
    return;
  }

  const invoiceToast = toast.loading('셀피아 송장 자동채번 중…');
  try {
    const invoice = await runSellpiaAutoInvoice();
    if (invoice.status === 'needs_confirmation') {
      logError('셀피아 송장채번', INVOICE_NEEDS_CONFIRMATION);
      promptOrderActionConfirmation({
        operationId: invoice.operationId,
        message: INVOICE_NEEDS_CONFIRMATION,
        confirmLabel: '발급됨 확인',
        closeLabel: '미발급으로 닫기',
        closeReason: '운영자가 셀피아에서 확인: 송장이 발급되지 않음',
        toastId: invoiceToast,
      });
      return;
    }
    const { issued, notFoundOrderNumbers } = invoice.result;
    // 채번 직후 캡처한 송장번호를 바로 CSV로 내려준다(재출력 재조회 없이 "여기서 바로").
    const invoiceRows = invoiceTrackingRows(issued);
    if (invoiceRows.length > 0) {
      const fileName = `셀피아_채번송장_${todayYmd().replace(/-/g, '')}.csv`;
      const blob = buildMallTrackingCsvBlob(invoiceRows);
      onGeneratedFile?.(generatedTrackingArtifact({
        blob,
        fileName,
        mallKey: 'sellpia',
        mallName: '셀피아',
        rows: invoiceRows,
      }));
      downloadBlob(blob, fileName);
    }
    toast.success(
      `송장 자동채번 완료 (${formatNumber(issued.length)}건)` +
        (invoiceRows.length > 0 ? ' — 채번 송장번호 CSV를 내려받았습니다.' : '. 이제 몰별 송장 업로드를 진행하세요.'),
      { id: invoiceToast, duration: 10000 },
    );
    if (notFoundOrderNumbers.length > 0) {
      const summary = summarizeOrderNumbers(notFoundOrderNumbers);
      toast.warning(`셀피아 송장 화면에 없어 채번하지 않은 주문 ${formatNumber(notFoundOrderNumbers.length)}건: ${summary}`, { duration: 15000 });
      logError(`셀피아 채번 제외 ${formatNumber(notFoundOrderNumbers.length)}건`, summary);
    }
    logInfo?.('셀피아 송장채번', `채번 ${formatNumber(issued.length)}건`);
  } catch (err) {
    const message = friendlyError(err) ?? '송장 자동채번 실패';
    logError('셀피아 송장채번', message);
    toast.error(message, { id: invoiceToast, duration: 12000 });
  }
}

export async function uploadTrackingForMall({
  account,
  history,
  logError,
  onGeneratedFile,
  collectTracking,
}: UploadTrackingOptions): Promise<void> {
  if (!isSellpiaProviderMall(account.key)) {
    toast(`${account.name} 송장 업로드는 아직 준비 중입니다.`);
    return;
  }

  const toastId = toast.loading('셀피아 채번 송장 조회 중…');
  try {
    // 채번 화면 그리드에서 발급된 송장번호를 바로 읽는다(재출력 우회).
    // ⭐오늘 채번(송장번호채번일자=오늘)된 송장만 업로드 대상으로 조회한다.
    // (날짜를 안 넘기면 확장이 최근 30일치를 반환 → 예전에 채번된 송장까지 섞여 올라감)
    const today = todayYmd();
    const { operationId: trackingOperationId, rows: allTracking } = await collectTracking();
    const tracking = filterTrackingByMall(allTracking, account.key);
    if (tracking.length === 0) {
      toast.info(`${account.name}에 전송할 채번된 송장이 없습니다. 셀피아 송장 자동채번을 먼저 진행하세요.`, {
        id: toastId,
        duration: 9000,
      });
      return;
    }

    if (account.key === ICECREAM_MALL_KEY) {
      toast.loading('아이스크림몰 배송번호와 송장번호 매칭 중…', { id: toastId });
      const orderNumbers = new Set(
        tracking.map((row) => row.ordNo.trim()).filter(Boolean),
      );
      const icecreamFiles = history.filter(
        (item) => resolveOrderCollectionMallKey(item) === ICECREAM_MALL_KEY,
      );
      const delivery = await buildIcecreamDeliveryRows(orderNumbers, icecreamFiles);
      if (delivery.missingOrderNumbers.length > 0) {
        throw new Error(
          `오늘 셀피아 송장 ${formatNumber(tracking.length)}건 중 배송번호를 찾지 못한 주문이 ` +
            `${formatNumber(delivery.missingOrderNumbers.length)}건 있습니다: ` +
            delivery.missingOrderNumbers.slice(0, 5).join(', ') +
            (delivery.missingOrderNumbers.length > 5 ? ' 외' : ''),
        );
      }
      if (delivery.rows.length === 0) {
        throw new Error(
          '아이스크림몰 배송번호가 없습니다. 해당 주문을 먼저 수집한 뒤 다시 시도해주세요.',
        );
      }

      const fileName = `아이스크림몰_출고완료_${today.replace(/-/g, '')}.xlsx`;
      const result = await buildIcecreamSendFinishFile(
        delivery.headers,
        delivery.rows,
        tracking,
        { download: false, fileName },
      );
      if (result.unmappedCouriers.length > 0) {
        throw new Error(
          `아이스크림몰 택배사 코드가 없는 송장이 있습니다: ${result.unmappedCouriers.join(', ')}`,
        );
      }
      if (!result.matchedRows) {
        throw new Error('아이스크림몰 배송번호와 셀피아 송장이 일치하지 않습니다.');
      }

      onGeneratedFile?.({
        blob: result.blob,
        fileName: result.fileName,
        mallKey: account.key,
        mallName: account.name,
        orderNumbers: [...orderNumbers],
        previewRows: result.previewRows,
        rowCount: result.matchedRows,
      });
      downloadBlob(result.blob, result.fileName);
      // 아이스크림몰 출고완료 업로드는 네이티브 파일 다이얼로그를 거쳐야 해 자동화가 불가능하다.
      // (파일 주입/직접 POST 모두 실제 등록으로 이어지지 않음.) 파일만 만들어 주고 업로드는
      // 화면의 [파일선택]으로 사람이 올린다.
      toast.success(
        `아이스크림몰 송장 ${formatNumber(result.matchedRows)}건 파일을 만들었습니다. `
          + '출고완료 일괄등록 화면에서 [파일선택]으로 올려주세요.',
        { id: toastId, duration: 9000 },
      );
      return;
    }

    const uploadMall = MallTrackingUploadMallSchema.safeParse(account.key);
    if (uploadMall.success) {
      await uploadTrackingToMall({
        account,
        mallKey: uploadMall.data,
        trackingOperationId,
        rowCount: tracking.length,
        toastId,
        logError,
      });
      return;
    }

    // 채번된 송장번호를 몰별 CSV(주문번호·수취인·우편·주소·택배사·송장번호)로 내려준다.
    const blob = buildMallTrackingCsvBlob(tracking);
    const fileName = `${account.name}_송장_${todayYmd().replace(/-/g, '')}.csv`;
    onGeneratedFile?.(generatedTrackingArtifact({
      blob,
      fileName,
      mallKey: account.key,
      mallName: account.name,
      rows: tracking,
    }));
    downloadBlob(blob, fileName);
    toast.success(`${account.name} 채번 송장 ${formatNumber(tracking.length)}건 CSV를 다운로드했습니다.`, {
      id: toastId,
      duration: 9000,
    });
  } catch (err) {
    const message = friendlyError(err) ?? '송장 업로드 파일 생성 실패';
    logError(`송장 업로드 · ${account.name}`, message);
    toast.error(message, { id: toastId });
  }
}

const UPLOAD_CONFIRM: Record<MallTrackingUploadMall, (name: string, count: string) => string> = {
  onch: (name, count) => `${name} 송장 ${count}건을 실제 등록할까요?\n\n되돌리기 어려운 작업입니다.`,
  kidkids: (name, count) => `${name} 송장 ${count}건을 실제 출고완료(발송처리)로 등록할까요?\n\n`
    + '되돌리기 어려운 작업입니다(출고완료로 확정됩니다).',
};

const ROW_STATUS_TEXT = { not_in_list: '목록에 없음', failed: '실패' } as const;

/**
 * ⚠️되돌리기 어려움: 온채널·키드키즈 송장 업로드(실행 `orders.mall_tracking_upload`, KID-366). 행은 서버가 방금 조회한 셀피아
 * 송장 실행의 캡처에서 그 몰 것만 고르고, 몰 차이(행별 등록·출고확정 한 번)와 택배사 매핑은 확장 site 어댑터가 맡는다.
 * 몰이 성공 코드를 주지 않아 제출만 확인된 실행(`reconciling`, 키드키즈)은 운영자가 몰에서 보고 확인·닫기 한다.
 */
async function uploadTrackingToMall({
  account,
  mallKey,
  trackingOperationId,
  rowCount,
  toastId,
  logError,
}: {
  account: OrderCollectionMallAccount;
  mallKey: MallTrackingUploadMall;
  trackingOperationId: string;
  rowCount: number;
  toastId: string | number;
  logError: (title: string, message: string) => void;
}): Promise<void> {
  if (!account.channelAccountId) {
    throw new Error(`${account.name} 채널 계정이 연결되어 있지 않아 송장을 올릴 수 없습니다. 몰 계정 설정을 확인해 주세요.`);
  }
  if (!window.confirm(UPLOAD_CONFIRM[mallKey](account.name, formatNumber(rowCount)))) {
    toast.info(`${account.name} 송장 등록을 취소했습니다.`, { id: toastId });
    return;
  }

  toast.loading(`${account.name}에 송장 등록 중…`, { id: toastId });
  const outcome = await uploadMallTracking({ channelAccountId: account.channelAccountId, mallKey, trackingOperationId });
  if (outcome.status === 'needs_confirmation') {
    const message = `${account.name} 확인 필요 — 송장 등록을 제출했지만 몰이 결과를 알려 주지 않았습니다. `
      + `${account.name} 출고 화면에서 등록 여부를 확인해 주세요.`;
    logError(`송장 업로드 · ${account.name}`, message);
    promptOrderActionConfirmation({
      operationId: outcome.operationId,
      message,
      confirmLabel: '등록됨 확인',
      closeLabel: '미등록으로 닫기',
      closeReason: `운영자가 ${account.name}에서 확인: 송장이 등록되지 않음`,
      toastId,
    });
    return;
  }
  reportTrackingUpload(account.name, outcome.result, toastId, logError);
}

function reportTrackingUpload(
  mallName: string,
  result: MallTrackingUploadResult,
  toastId: string | number,
  logError: (title: string, message: string) => void,
): void {
  const extras = [
    result.alreadyUploaded > 0 ? `이미 등록 ${formatNumber(result.alreadyUploaded)}건` : null,
    result.notInList > 0 ? `목록에 없음 ${formatNumber(result.notInList)}건` : null,
    result.failed > 0 ? `실패 ${formatNumber(result.failed)}건` : null,
  ].filter(Boolean);
  if (result.uploaded > 0) {
    toast.success([`${mallName} 송장 ${formatNumber(result.uploaded)}건 등록 완료`, ...extras].join(' · '), { id: toastId, duration: 10000 });
  } else {
    toast.warning(
      [`${mallName}에서 등록할 주문을 찾지 못했습니다`, ...extras].join(' · ')
        + ' (셀피아 송장 주문번호와 몰 목록 주문번호를 확인해 주세요.)',
      { id: toastId, duration: 10000 },
    );
  }
  const problems = result.rows.filter((row) => row.status === 'not_in_list' || row.status === 'failed');
  if (problems.length > 0) {
    logError(
      `${mallName} 송장 실패 ${formatNumber(problems.length)}건`,
      problems
        .slice(0, 6)
        .map((row) => `${row.orderNo}: ${row.mallMessage ?? ROW_STATUS_TEXT[row.status as keyof typeof ROW_STATUS_TEXT]}`)
        .join(' / '),
    );
  }
}
