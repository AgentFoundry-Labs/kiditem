import * as XLSX from 'xlsx';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import type { OrderCollectionConversionResult } from './order-collection-api';
import type { OrderCollectionExtensionRun } from './order-collection-extension';

/** 해법몰 주문 1건 = 상품 1행(등록번호 = 장바구니 idx). */
export interface HaebeopOrder {
  orderNo?: string;
  regNo?: string;
  vendor?: string;
  productName?: string;
  productCode?: string;
  option?: string;
  qty?: number;
  sellPrice?: number;
  sellAmount?: number;
  shipFee?: number;
  payMethod?: string;
  orderDate?: string;
  invoice?: string;
  ordName?: string;
  group?: string;
  ordId?: string;
  ordEmail?: string;
  ordTel?: string;
  ordMobile?: string;
  ordPost?: string;
  ordAddr?: string;
  recvName?: string;
  recvTel?: string;
  recvMobile?: string;
  recvPost?: string;
  recvAddr?: string;
  demand?: string;
  memo?: string;
  status?: string;
}

interface HaebeopCollectResponse {
  success?: boolean;
  orders?: HaebeopOrder[];
  count?: number;
  detailCount?: number;
  error?: string;
  pendingLogin?: boolean;
}

/**
 * 확장으로 해법몰(mallseller.genimarket.co.kr) 결제완료 주문을 로그인 세션에서 가져온다.
 *
 * ⭐엑셀 다운로드를 쓰지 않는다. 해법몰 엑셀은 암호 ZIP 이라 자동화가 어려운데, 주문 상세
 * 팝업(pop_order_info.php)이 수취인·주소·연락처·상품·금액을 모두 담고 있어 그걸 읽는다.
 * date "YYYY-MM-DD" 면 그 발주일만, fromDate/toDate 를 주면 그 범위만 조회한다.
 */
export async function collectHaebeopOrdersFromExtension(
  options: { date?: string; fromDate?: string; toDate?: string; vendor?: string } = {},
  run?: OrderCollectionExtensionRun,
): Promise<HaebeopOrder[]> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 mallseller.genimarket.co.kr 에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<HaebeopCollectResponse>(
    extensionId,
    {
      action: 'collectHaebeopOrders',
      date: options.date ?? run?.date,
      fromDate: options.fromDate,
      toDate: options.toDate,
      vendor: options.vendor,
      runId: run?.runId ?? createSecureRandomUuid(),
    },
    190000,
  );
  if (!res?.success || !Array.isArray(res.orders)) {
    throw Object.assign(new Error(res?.error ?? '해법몰 주문 수집에 실패했습니다.'), {
      pendingLogin: res?.pendingLogin === true,
    });
  }
  return res.orders;
}

/** 수집한 해법몰 주문을 셀피아 업로드 양식(.xls 50컬럼)으로 변환. */
export async function convertHaebeopToSellpiaFile(
  orders: HaebeopOrder[],
  options?: { download?: boolean },
): Promise<OrderCollectionConversionResult> {
  const res = await apiClient.fetchRaw('/api/orders/collection/haebeop/convert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orders }),
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || '해법몰 변환에 실패했습니다.');
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const fileName = m ? decodeURIComponent(m[1]) : '해법몰_셀피아변환.xls';
  if (options?.download !== false) {
    downloadBlob(blob, fileName);
  }
  return {
    fileName,
    blob,
    previewRows: await readHaebeopPreviewRows(blob),
    sourceRows: haebeopNumHeader(res, 'X-Order-Collection-Source-Rows'),
    productRows: haebeopNumHeader(res, 'X-Order-Collection-Product-Rows'),
    outputRows: haebeopNumHeader(res, 'X-Order-Collection-Output-Rows'),
    skippedRows: haebeopNumHeader(res, 'X-Order-Collection-Skipped-Rows'),
  };
}

function haebeopNumHeader(res: Response, name: string): number | null {
  const v = res.headers.get(name);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 생성된 .xls(해법몰 50컬럼)에서 미리보기 행 추출. */
async function readHaebeopPreviewRows(blob: Blob): Promise<string[][]> {
  const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | null | undefined>>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  return rows.slice(0, 24).map((row) => row.slice(0, 50).map((cell) => String(cell ?? '')));
}
