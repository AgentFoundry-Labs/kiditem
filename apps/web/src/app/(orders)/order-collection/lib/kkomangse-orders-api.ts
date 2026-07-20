import * as XLSX from 'xlsx';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import type { OrderCollectionConversionResult } from './order-collection-api';
import type { OrderCollectionExtensionRun } from './order-collection-extension';

interface KkomangseCollectResponse {
  success?: boolean;
  xlsxBase64?: string;
  size?: number;
  error?: string;
}

/**
 * order-collector 확장으로 꼬망세(EduPre) 입점관리자 "선택엑셀다운"(검색결과 전체) xlsx 를
 * 로그인 세션에서 가져온다 (base64). HTML 스크랩이 아니라 관리자의 엑셀 export 를 그대로 fetch.
 */
export async function collectKkomangseXlsxFromExtension(run?: OrderCollectionExtensionRun): Promise<string> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector 를 Chrome 에 로드하고 nstore.edupre.co.kr 관리자에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<KkomangseCollectResponse>(
    extensionId,
    {
      action: 'collectKkomangseOrders',
      date: run?.date,
      runId: run?.runId ?? globalThis.crypto.randomUUID(),
    },
    90000,
  );
  if (!res?.success || !res.xlsxBase64) {
    throw new Error(res?.error ?? '꼬망세 주문 수집에 실패했습니다.');
  }
  return res.xlsxBase64;
}

/** 수집한 꼬망세 xlsx(base64)를 셀피아 업로드 양식(.xls)으로 변환. 생성 파일 목록 등록용 결과 반환. */
export async function convertKkomangseToSellpiaFile(
  xlsxBase64: string,
  options?: { download?: boolean; date?: string },
): Promise<OrderCollectionConversionResult> {
  const res = await apiClient.fetchRaw('/api/orders/collection/kkomangse/convert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ xlsxBase64, date: options?.date }),
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || '꼬망세 변환에 실패했습니다.');
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const fileName = m ? decodeURIComponent(m[1]) : '꼬망세_셀피아변환.xls';
  if (options?.download !== false) {
    downloadBlob(blob, fileName);
  }
  return {
    fileName,
    blob,
    previewRows: await readKkomangsePreviewRows(blob),
    sourceRows: kkomangseNumHeader(res, 'X-Order-Collection-Source-Rows'),
    productRows: kkomangseNumHeader(res, 'X-Order-Collection-Product-Rows'),
    outputRows: kkomangseNumHeader(res, 'X-Order-Collection-Output-Rows'),
    skippedRows: kkomangseNumHeader(res, 'X-Order-Collection-Skipped-Rows'),
  };
}

function kkomangseNumHeader(res: Response, name: string): number | null {
  const v = res.headers.get(name);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 생성된 .xls(꼬망세 27컬럼)에서 미리보기 행 추출. */
async function readKkomangsePreviewRows(blob: Blob): Promise<string[][]> {
  const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | null | undefined>>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  return rows.slice(0, 24).map((row) => row.slice(0, 27).map((cell) => String(cell ?? '')));
}
