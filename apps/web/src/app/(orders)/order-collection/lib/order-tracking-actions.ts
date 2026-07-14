import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { downloadBlob } from '@/lib/browser-download';
import { formatNumber } from '@/lib/utils';
import { buildIcecreamDeliveryRows } from './icecream-delivery-index';
import {
  buildDomeggookShipFile,
  buildIcecreamSendFinishFile,
  buildMallTrackingCsvBlob,
  collectSellpiaDeliTrackingFromExtension,
  filterTrackingByMall,
  isTrackingSupportedMall,
  uploadDomeggookTrackingViaExtension,
  uploadOnchTrackingViaExtension,
} from './icecream-tracking-api';
import { ICECREAM_MALL_KEY, todayYmd, type ConversionHistoryItem } from './order-collection-page-model';
import { resolveOrderCollectionMallKey } from './order-collection-malls';
import type { OrderCollectionMallAccount } from './order-mall-account-api';

interface UploadTrackingOptions {
  account: OrderCollectionMallAccount;
  history: ConversionHistoryItem[];
  logError: (title: string, message: string) => void;
}

export async function uploadTrackingForMall({
  account,
  history,
  logError,
}: UploadTrackingOptions): Promise<void> {
  if (!isTrackingSupportedMall(account.key)) {
    toast(`${account.name} 송장 업로드는 아직 준비 중입니다.`);
    return;
  }

  const toastId = toast.loading('셀피아 송장 조회 중…');
  try {
    const allTracking = await collectSellpiaDeliTrackingFromExtension();
    const tracking = filterTrackingByMall(allTracking, account.key);
    if (tracking.length === 0) {
      toast.info(`${account.name}에 전송할 셀피아 송장이 없습니다.`, {
        id: toastId,
        duration: 9000,
      });
      return;
    }

    if (account.key === ICECREAM_MALL_KEY) {
      toast.loading('출고완료 업로드 파일 생성 중…', { id: toastId });
      const orderNumbers = new Set(tracking.map((row) => row.ordNo).filter(Boolean));
      const icecreamFiles = history.filter(
        (item) => resolveOrderCollectionMallKey(item) === ICECREAM_MALL_KEY,
      );
      const delivery = await buildIcecreamDeliveryRows(orderNumbers, icecreamFiles);
      if (delivery.rows.length === 0) {
        toast.info(
          `송장 ${formatNumber(tracking.length)}건과 매칭할 배송번호가 없습니다. 아이스크림몰 주문을 먼저 수집해주세요.`,
          { id: toastId, duration: 9000 },
        );
        return;
      }

      const result = await buildIcecreamSendFinishFile(
        delivery.headers,
        delivery.rows,
        tracking,
        { download: false },
      );
      if (!result.matchedRows) {
        toast.info('셀피아 송장과 수집 주문의 배송번호가 일치하지 않습니다.', {
          id: toastId,
          duration: 8000,
        });
        return;
      }

      downloadBlob(result.blob, result.fileName);
      toast.success(
        `송장 ${formatNumber(result.matchedRows)}건 출고완료 파일을 생성했습니다. 몰에는 아직 업로드하지 않았습니다.`,
        { id: toastId, duration: 8000 },
      );
      if (result.unmappedCouriers.length > 0) {
        toast.warning(`택배사 코드 매핑 실패: ${result.unmappedCouriers.join(', ')}`, {
          duration: 10000,
        });
      }
      return;
    }

    if (account.key === 'domeggook') {
      toast.loading('도매꾹 송장 파일 생성 중…', { id: toastId });
      const built = await buildDomeggookShipFile(tracking, { download: true });
      if (built.unmappedCouriers.length > 0) {
        toast.warning(`택배사 코드 매핑 실패: ${built.unmappedCouriers.join(', ')}`, {
          duration: 10000,
        });
      }
      const confirmed = window.confirm(
        `도매꾹 송장 ${formatNumber(built.rowCount)}건을 실제 발송처리할까요?\n\n` +
          '되돌리기 어려운 작업입니다. 방금 다운로드된 파일을 먼저 확인하세요.',
      );
      if (!confirmed) {
        toast.info('송장 파일만 다운로드하고 업로드는 중단했습니다.', {
          id: toastId,
          duration: 8000,
        });
        return;
      }

      toast.loading('도매꾹에 송장 업로드 중…', { id: toastId });
      const uploaded = await uploadDomeggookTrackingViaExtension(
        built.base64,
        built.fileName,
        built.orderNos,
      );
      if (uploaded.uploaded) {
        toast.success(`도매꾹 송장 ${formatNumber(built.rowCount)}건 업로드 완료`, {
          id: toastId,
          duration: 8000,
        });
      } else {
        toast.warning(
          `도매꾹 응답에서 성공을 확정하지 못했습니다. 발주·발송 화면에서 확인해주세요. (HTTP ${uploaded.httpStatus ?? '?'})`,
          { id: toastId, duration: 12000 },
        );
      }
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

    const blob = buildMallTrackingCsvBlob(tracking);
    const fileName = `${account.name}_송장_${todayYmd().replace(/-/g, '')}.csv`;
    downloadBlob(blob, fileName);
    toast.success(`${account.name} 송장 ${formatNumber(tracking.length)}건 파일을 다운로드했습니다.`, {
      id: toastId,
      duration: 9000,
    });
  } catch (err) {
    const message = friendlyError(err) ?? '송장 업로드 파일 생성 실패';
    logError(`송장 업로드 · ${account.name}`, message);
    toast.error(message, { id: toastId });
  }
}
