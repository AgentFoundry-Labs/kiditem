import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { convertDomeggookOrderFile } from './order-collection-api';
import type { OrderCollectionConversionResult } from './order-collection-api';

interface DomeggookCollectResponse {
  success?: boolean;
  csvBase64?: string;
  fileName?: string;
  size?: number;
  reqContent?: string;
  error?: string;
}

/**
 * order-collector 확장이 도매꾹 "엑셀다운로드 관리 > 주문관리"의 최신 생성 CSV(CDN 직링크)를
 * 로그인 세션으로 가져온다 (base64, EUC-KR bytes 그대로). 확장 서비스워커가 CORS 우회.
 */
export async function collectDomeggookCsvFromExtension(
  date?: string, // "YYYY-MM-DD" — 확장이 이 기간으로 엑셀 생성 요청
): Promise<{ csvBase64: string; fileName: string }> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector 를 Chrome 에 로드하고 domeggook.com 에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<DomeggookCollectResponse>(
    extensionId,
    { action: 'collectDomeggookOrders', date },
    260000, // 도매꾹은 엑셀 생성(비동기, 최대 4분 폴링) 후 다운로드라 넉넉히
  );
  if (!res?.success || !res.csvBase64) {
    throw new Error(res?.error ?? '도매꾹 주문 수집에 실패했습니다.');
  }
  return { csvBase64: res.csvBase64, fileName: res.fileName ?? '도매꾹.csv' };
}

/** 수집한 도매꾹 CSV(base64, EUC-KR bytes)를 File 로 재구성해 셀피아 변환. date 주면 그날 주문만. */
export async function convertDomeggookCsvBase64(
  csvBase64: string,
  fileName: string,
  options?: { date?: string; download?: boolean },
): Promise<OrderCollectionConversionResult> {
  const bin = atob(csvBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], fileName, { type: 'text/csv' });
  return convertDomeggookOrderFile(file, options);
}
