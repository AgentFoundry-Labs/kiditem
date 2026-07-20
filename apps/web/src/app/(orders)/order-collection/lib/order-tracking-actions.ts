import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { downloadBlob } from '@/lib/browser-download';
import { formatNumber } from '@/lib/utils';
import {
  runSellpiaAutoInvoiceViaExtension,
  runSellpiaPostTransferViaExtension,
  type SellpiaUnmatchedRow,
} from './order-collection-extension';
import {
  buildMallTrackingCsvBlob,
  collectSellpiaDeliTrackingFromExtension,
  filterTrackingByMall,
  isTrackingSupportedMall,
  uploadOnchTrackingViaExtension,
} from './icecream-tracking-api';
import { todayYmd } from './order-collection-page-model';
import type { OrderCollectionMallAccount } from './order-mall-account-api';

interface UploadTrackingOptions {
  account: OrderCollectionMallAccount;
  logError: (title: string, message: string) => void;
}

interface SellpiaPostProcessOptions {
  logError: (title: string, message: string) => void;
  logInfo?: (title: string, message: string) => void;
}

function summarizeUnmatched(rows: SellpiaUnmatchedRow[], limit = 8): string {
  const head = rows
    .slice(0, limit)
    .map((row) => {
      const who = [row.receiver, row.provider].filter(Boolean).join('·');
      const what = [row.product, row.option].filter(Boolean).join(' ');
      const reason = row.result ? ` (${row.result})` : '';
      return `${who ? `${who} — ` : ''}${what}${reason}`.trim();
    })
    .join(' / ');
  return rows.length > limit ? `${head} 외 ${formatNumber(rows.length - limit)}건` : head;
}

/**
 * 셀피아 전송 이후 후처리 원클릭.
 * 등록 → 조회 → 자동합포 → 자동재고매칭(비파괴)까지 자동 실행하고, 자동재고매칭이 안 된
 * 미매칭 주문은 토스트+활동로그로 알린다. 되돌리기 어려운 '송장 자동채번'은 사용자 확인 후에만 진행한다.
 */
export async function runSellpiaPostProcess({
  logError,
  logInfo,
}: SellpiaPostProcessOptions): Promise<void> {
  const toastId = toast.loading('셀피아 후처리 중… (등록 → 조회 → 자동합포 → 자동재고매칭)');
  let result;
  try {
    result = await runSellpiaPostTransferViaExtension();
  } catch (err) {
    const message = friendlyError(err) ?? '셀피아 후처리 실패';
    logError('셀피아 후처리', message);
    toast.error(message, { id: toastId, duration: 10000 });
    return;
  }

  if (!result.success) {
    const message = result.error ?? '셀피아 후처리에 실패했습니다.';
    logError(`셀피아 후처리 · ${result.step ?? '단계'}`, message);
    toast.error(message, { id: toastId, duration: 12000 });
    return;
  }

  const matched = result.matched ?? 0;
  const unmatched = result.unmatched ?? [];
  toast.success(
    `셀피아 재고매칭 완료 — 조회 ${formatNumber(result.listCount ?? 0)}건 · 매칭 ${formatNumber(matched)}건 · 미매칭 ${formatNumber(unmatched.length)}건`,
    { id: toastId, duration: 9000 },
  );

  if (unmatched.length > 0) {
    const summary = summarizeUnmatched(unmatched);
    toast.warning(`⚠️ 자동재고매칭 안 된 주문 ${formatNumber(unmatched.length)}건: ${summary}`, {
      duration: 15000,
    });
    logError(`셀피아 미매칭 ${formatNumber(unmatched.length)}건`, summary);
  }

  const readyForInvoice = (result.listCount ?? 0) > 0;
  if (!readyForInvoice) {
    return;
  }

  const confirmed = window.confirm(
    `재고매칭 완료: 매칭 ${formatNumber(matched)}건` +
      (unmatched.length > 0 ? `, 미매칭 ${formatNumber(unmatched.length)}건` : '') +
      `\n\n이어서 '송장 자동채번'을 진행할까요?\n되돌리기 어려운 작업입니다(실제 송장번호가 발급됩니다).` +
      (unmatched.length > 0 ? '\n미매칭 주문은 채번되지 않습니다.' : ''),
  );
  if (!confirmed) {
    toast.info('송장 자동채번은 진행하지 않았습니다. 재고매칭까지 완료되었습니다.', { duration: 8000 });
    return;
  }

  const invoiceToast = toast.loading('셀피아 송장 자동채번 중…');
  try {
    const invoice = await runSellpiaAutoInvoiceViaExtension();
    if (!invoice.success) {
      const message = invoice.error ?? '송장 자동채번에 실패했습니다.';
      logError('셀피아 송장채번', message);
      toast.error(message, { id: invoiceToast, duration: 12000 });
      return;
    }
    // 채번 직후 캡처한 송장번호를 바로 CSV로 내려준다(재출력 재조회 없이 "여기서 바로").
    const invoiceRows = invoice.rows ?? [];
    if (invoiceRows.length > 0) {
      const blob = buildMallTrackingCsvBlob(invoiceRows);
      downloadBlob(blob, `셀피아_채번송장_${todayYmd().replace(/-/g, '')}.csv`);
    }
    toast.success(
      `송장 자동채번 완료 (${formatNumber(invoice.invoiced ?? invoiceRows.length)}건)` +
        (invoiceRows.length > 0 ? ' — 채번 송장번호 CSV를 내려받았습니다.' : '. 이제 몰별 송장 업로드를 진행하세요.'),
      { id: invoiceToast, duration: 10000 },
    );
    logInfo?.('셀피아 송장채번', invoice.message ?? `채번 ${formatNumber(invoice.invoiced ?? 0)}건`);
  } catch (err) {
    const message = friendlyError(err) ?? '송장 자동채번 실패';
    logError('셀피아 송장채번', message);
    toast.error(message, { id: invoiceToast, duration: 12000 });
  }
}

export async function uploadTrackingForMall({
  account,
  logError,
}: UploadTrackingOptions): Promise<void> {
  if (!isTrackingSupportedMall(account.key)) {
    toast(`${account.name} 송장 업로드는 아직 준비 중입니다.`);
    return;
  }

  const toastId = toast.loading('셀피아 채번 송장 조회 중…');
  try {
    // 채번 화면 그리드에서 발급된 송장번호를 바로 읽는다(재출력 우회).
    const allTracking = await collectSellpiaDeliTrackingFromExtension();
    const tracking = filterTrackingByMall(allTracking, account.key);
    if (tracking.length === 0) {
      toast.info(`${account.name}에 전송할 채번된 송장이 없습니다. 셀피아 송장 자동채번을 먼저 진행하세요.`, {
        id: toastId,
        duration: 9000,
      });
      return;
    }

    if (account.key === 'onch') {
      const confirmed = window.confirm(
        `온채널 송장 ${formatNumber(tracking.length)}건을 실제 등록할까요?\n\n되돌리기 어려운 작업입니다.`,
      );
      if (!confirmed) {
        toast.info('온채널 송장 등록을 취소했습니다.', { id: toastId });
        return;
      }

      toast.loading('온채널에 송장 등록 중…', { id: toastId });
      const uploaded = await uploadOnchTrackingViaExtension(tracking);
      const failed = uploaded.results.filter((result) => !result.ok);
      if (uploaded.okCount > 0) {
        toast.success(
          `온채널 송장 ${formatNumber(uploaded.okCount)}/${formatNumber(uploaded.total)}건 등록 완료`,
          { id: toastId, duration: 10000 },
        );
      } else {
        toast.warning('온채널에서 매칭되는 미발송 주문을 찾지 못했습니다.', {
          id: toastId,
          duration: 10000,
        });
      }
      if (failed.length > 0) {
        logError(
          `온채널 송장 실패 ${failed.length}건`,
          failed
            .slice(0, 6)
            .map((result) => `${result.ordNo}: ${result.reason ?? ''}`)
            .join(' / '),
        );
      }
      return;
    }

    // 채번된 송장번호를 몰별 CSV(주문번호·수취인·우편·주소·택배사·송장번호)로 내려준다.
    const blob = buildMallTrackingCsvBlob(tracking);
    const fileName = `${account.name}_송장_${todayYmd().replace(/-/g, '')}.csv`;
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
