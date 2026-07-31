import * as XLSX from 'xlsx';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import type { OrderCollectionConversionResult } from './order-collection-api';
import type { OrderCollectionExtensionRun } from './order-collection-extension';

export interface KidkidsOrderItem {
  name?: string;
  qty?: number;
  unit?: number;
  sum?: number;
}
export interface KidkidsOrder {
  om?: string;
  ordName?: string; // 주문자명(유치원)
  orderDate?: string; // "2026-07-01 13:55:47"
  recvName?: string;
  recvAddr?: string; // 우편번호 접두 포함
  recvTel?: string;
  recvMobile?: string;
  recvMsg?: string;
  items?: KidkidsOrderItem[];
}

interface KidkidsCollectResponse {
  success?: boolean;
  orders?: KidkidsOrder[];
  count?: number;
  error?: string;
  pendingLogin?: boolean;
}

/**
 * order-collector 확장으로 키드키즈(partner.kidkids.net) 출고관리 주문을 로그인 세션에서 가져온다.
 * 목록(logis_index)을 헤더 기준으로 읽고, planDate 가 오면 출고예정 미지정 주문에 출고예정일을 지정한 뒤
 * 발주서02(logis_down4) fetch → 주소·우편번호·공급단가 포함. date "YYYY-MM-DD" 면 그 주문일만.
 * planDate "YYYY-MM-DD" 는 신규(출고예정 미지정) 주문에 지정할 출고예정일(생략 시 상태 변경 없이 읽기만).
 */
export async function collectKidkidsOrdersFromExtension(
  date?: string,
  run?: OrderCollectionExtensionRun,
  planDate?: string,
): Promise<KidkidsOrder[]> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 partner.kidkids.net 출고관리에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<KidkidsCollectResponse>(
    extensionId,
    {
      action: 'collectKidkidsOrders',
      date: date ?? run?.date,
      planDate,
      runId: run?.runId ?? createSecureRandomUuid(),
    },
    190000,
  );
  if (!res?.success || !Array.isArray(res.orders)) {
    throw Object.assign(new Error(res?.error ?? '키드키즈 주문 수집에 실패했습니다.'), {
      pendingLogin: res?.pendingLogin === true,
    });
  }
  return res.orders;
}

/** 수집한 키드키즈 주문(orders[])을 셀피아 업로드 양식(.xls)으로 변환. startOrderNo=셀피아 주문번호 시작값(기본 96090). */
export async function convertKidkidsToSellpiaFile(
  orders: KidkidsOrder[],
  options?: { startOrderNo?: number; download?: boolean },
): Promise<OrderCollectionConversionResult> {
  const res = await apiClient.fetchRaw('/api/orders/collection/kidkids/convert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orders, startOrderNo: options?.startOrderNo }),
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || '키드키즈 변환에 실패했습니다.');
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const fileName = m ? decodeURIComponent(m[1]) : '키드키즈_셀피아변환.xls';
  if (options?.download !== false) {
    downloadBlob(blob, fileName);
  }
  return {
    fileName,
    blob,
    previewRows: await readKidkidsPreviewRows(blob),
    sourceRows: kidkidsNumHeader(res, 'X-Order-Collection-Source-Rows'),
    productRows: kidkidsNumHeader(res, 'X-Order-Collection-Product-Rows'),
    outputRows: kidkidsNumHeader(res, 'X-Order-Collection-Output-Rows'),
    skippedRows: kidkidsNumHeader(res, 'X-Order-Collection-Skipped-Rows'),
  };
}

function kidkidsNumHeader(res: Response, name: string): number | null {
  const v = res.headers.get(name);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 생성된 .xls(키드키즈 17컬럼)에서 미리보기 행 추출. */
async function readKidkidsPreviewRows(blob: Blob): Promise<string[][]> {
  const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | null | undefined>>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  return rows.slice(0, 24).map((row) => row.slice(0, 17).map((cell) => String(cell ?? '')));
}
