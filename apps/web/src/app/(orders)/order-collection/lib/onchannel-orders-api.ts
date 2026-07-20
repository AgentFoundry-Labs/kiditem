import * as XLSX from 'xlsx';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import type { OrderCollectionConversionResult } from './order-collection-api';
import type { OrderCollectionExtensionRun } from './order-collection-extension';

export interface OnchannelOrder {
  orderCode?: string;
  date?: string;
  productName?: string;
  productCode?: string;
  option?: string;
  qty?: number;
  productPrice?: number;
  shippingFee?: number;
  customer?: string;
  phone?: string;
  emergency?: string;
  zip?: string;
  address?: string;
  message?: string;
}

interface OnchannelCollectResponse {
  success?: boolean;
  orders?: OnchannelOrder[];
  count?: number;
  error?: string;
}

/**
 * order-collector 확장으로 온채널(onch3.co.kr) 입점관리자 주문 목록을 로그인 세션에서 가져온다.
 * 리스트(주문코드+일자) 스크랩 + 주문별 상세모달(order_detail_supplier) fetch → 상품금액/배송비 분리값 포함.
 */
export async function collectOnchannelOrdersFromExtension(date?: string, run?: OrderCollectionExtensionRun): Promise<OnchannelOrder[]> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector 를 Chrome 에 로드하고 onch3.co.kr 입점관리자에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<OnchannelCollectResponse>(
    extensionId,
    { action: 'collectOnchannelOrders', date, runId: run?.runId ?? globalThis.crypto.randomUUID() }, // "YYYY-MM-DD" 면 그날 주문만
    130000,
  );
  if (!res?.success || !Array.isArray(res.orders)) {
    throw new Error(res?.error ?? '온채널 주문 수집에 실패했습니다.');
  }
  return res.orders;
}

/** 수집한 온채널 주문(orders[])을 셀피아 업로드 양식(.xls)으로 변환. 생성 파일 목록 등록용 결과 반환. */
export async function convertOnchannelToSellpiaFile(
  orders: OnchannelOrder[],
  options?: { download?: boolean },
): Promise<OrderCollectionConversionResult> {
  const res = await apiClient.fetchRaw('/api/orders/collection/onchannel/convert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orders }),
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || '온채널 변환에 실패했습니다.');
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const fileName = m ? decodeURIComponent(m[1]) : '온채널_셀피아변환.xls';
  if (options?.download !== false) {
    downloadBlob(blob, fileName);
  }
  return {
    fileName,
    blob,
    previewRows: await readOnchannelPreviewRows(blob),
    sourceRows: onchNumHeader(res, 'X-Order-Collection-Source-Rows'),
    productRows: onchNumHeader(res, 'X-Order-Collection-Product-Rows'),
    outputRows: onchNumHeader(res, 'X-Order-Collection-Output-Rows'),
    skippedRows: onchNumHeader(res, 'X-Order-Collection-Skipped-Rows'),
  };
}

function onchNumHeader(res: Response, name: string): number | null {
  const v = res.headers.get(name);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 생성된 .xls(온채널 16컬럼 "Simple")에서 미리보기 행 추출. */
async function readOnchannelPreviewRows(blob: Blob): Promise<string[][]> {
  const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | null | undefined>>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  return rows.slice(0, 24).map((row) => row.slice(0, 16).map((cell) => String(cell ?? '')));
}
