import * as XLSX from 'xlsx';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import type { OrderCollectionConversionResult } from './order-collection-api';

/** 카카오(톡스토어) OMS `_search` 응답 한 건 (배송준비중 statusCode 301). 확장이 raw 그대로 넘긴다. */
export interface KakaoOrder {
  statusCode?: number;
  statusName?: string;
  paymentId?: number | string;
  itemId?: number | string;
  itemName?: string;
  optionTitle?: string;
  quantity?: number;
  receiverName?: string;
  receiverMobileNumber?: string;
  address?: string;
  zoneCode?: string;
  [key: string]: unknown;
}

interface KakaoCollectResponse {
  success?: boolean;
  orders?: KakaoOrder[];
  count?: number;
  error?: string;
  pendingLogin?: boolean;
}

/**
 * order-collector 확장으로 카카오쇼핑 판매자센터(shopping-seller.kakao.com) 주문을 로그인 세션에서 가져온다.
 * ⭐OMS `_search` API 스크랩 — 다운로드 없이 배송준비중(301)만, PII 언마스킹된 상태로 반환.
 */
export async function collectKakaoOrdersFromExtension(date?: string): Promise<KakaoOrder[]> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector 를 Chrome 에 로드하고 shopping-seller.kakao.com 에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<KakaoCollectResponse>(
    extensionId,
    { action: 'collectKakaoOrders', date }, // "YYYY-MM-DD" 면 그날 결제분만
    130000,
  );
  if (!res?.success || !Array.isArray(res.orders)) {
    throw Object.assign(new Error(res?.error ?? '카카오 주문 수집에 실패했습니다.'), {
      pendingLogin: res?.pendingLogin === true,
    });
  }
  return res.orders;
}

/** 수집한 카카오 주문(배송준비중)을 셀피아 카카오 업로드 양식(.xls 45컬럼)으로 변환. */
export async function convertKakaoToSellpiaFile(
  orders: KakaoOrder[],
  options?: { download?: boolean },
): Promise<OrderCollectionConversionResult> {
  const res = await apiClient.fetchRaw('/api/orders/collection/kakao/convert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orders }),
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || '카카오 변환에 실패했습니다.');
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const fileName = m ? decodeURIComponent(m[1]) : '카카오_셀피아변환.xls';
  if (options?.download !== false) {
    downloadBlob(blob, fileName);
  }
  return {
    fileName,
    blob,
    previewRows: await readKakaoPreviewRows(blob),
    sourceRows: kakaoNumHeader(res, 'X-Order-Collection-Source-Rows'),
    productRows: kakaoNumHeader(res, 'X-Order-Collection-Product-Rows'),
    outputRows: kakaoNumHeader(res, 'X-Order-Collection-Output-Rows'),
    skippedRows: kakaoNumHeader(res, 'X-Order-Collection-Skipped-Rows'),
  };
}

function kakaoNumHeader(res: Response, name: string): number | null {
  const v = res.headers.get(name);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 생성된 .xls(카카오 45컬럼)에서 미리보기 행 추출. */
async function readKakaoPreviewRows(blob: Blob): Promise<string[][]> {
  const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | null | undefined>>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  return rows.slice(0, 24).map((row) => row.slice(0, 45).map((cell) => String(cell ?? '')));
}
