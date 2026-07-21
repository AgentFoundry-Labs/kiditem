import * as XLSX from 'xlsx';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import type { OrderCollectionConversionResult } from './order-collection-api';
import type { OrderCollectionExtensionRun } from './order-collection-extension';
import type {
  CoupangDirectOrderCollectionRequest,
  CoupangDirectOrderItem,
  CoupangDirectPurchaseOrder,
} from '@kiditem/shared/coupang-direct-order';

export type CoupangDirectItem = CoupangDirectOrderItem;
export type CoupangDirectPo = CoupangDirectPurchaseOrder;
export type CoupangDirectData = Pick<
  CoupangDirectOrderCollectionRequest,
  'pos' | 'centers'
>;

interface CoupangCollectResponse {
  success?: boolean;
  pos?: CoupangDirectPo[];
  centers?: CoupangDirectData['centers'];
  count?: number;
  error?: string;
}

export type CoupangTransport = 'SHIPMENT' | 'MILKRUN';
export const COUPANG_TRANSPORT_LABEL: Record<CoupangTransport, string> = {
  SHIPMENT: '쉽먼트',
  MILKRUN: '밀크런',
};

/**
 * order-collector 확장으로 쿠팡 공급사허브의 "발주확정(PA)" 발주를 수집한다.
 * 발주목록(po-web) + 발주별 품목(/scm 상세) + 센터주소(po-web) 를 모아 운송유형(쉽먼트/밀크런)까지 담아 온다.
 */
export async function collectCoupangDirectFromExtension(run?: OrderCollectionExtensionRun): Promise<CoupangDirectData> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector 를 Chrome 에 로드하고 supplier.coupang.com 에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<CoupangCollectResponse>(
    extensionId,
    {
      action: 'collectCoupangDirectOrders',
      date: run?.date,
      runId: run?.runId ?? globalThis.crypto.randomUUID(),
      deferTerminal: Boolean(run?.runId),
    },
    240000, // 발주별 /scm 상세 fetch 가 많아 넉넉히
  );
  if (!res?.success || !Array.isArray(res.pos)) {
    throw new Error(res?.error ?? '쿠팡직배송 발주 수집에 실패했습니다.');
  }
  return { pos: res.pos, centers: res.centers ?? {} };
}

/** 수집한 발주 데이터를 운송유형별로 백엔드에서 셀피아 양식(.xls, 서식/시트 유지)으로 생성. */
export async function convertCoupangDirectToSellpiaFile(
  data: CoupangDirectData,
  transport: CoupangTransport,
  options: {
    channelAccountId: string;
    download?: boolean;
    signal?: AbortSignal;
  },
): Promise<OrderCollectionConversionResult> {
  const res = await apiClient.fetchRaw('/api/orders/collection/coupang-directship/convert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      channelAccountId: options.channelAccountId,
      pos: data.pos,
      centers: data.centers,
      transport,
    }),
    signal: options?.signal,
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || '쿠팡직배송 변환에 실패했습니다.');
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const fileName = m
    ? decodeURIComponent(m[1])
    : `쿠팡직배송_${COUPANG_TRANSPORT_LABEL[transport]}_셀피아변환.xls`;
  if (options?.download !== false) downloadBlob(blob, fileName);
  return {
    fileName,
    blob,
    previewRows: await readPreviewRows(blob),
    sourceRows: numHeader(res, 'X-Order-Collection-Source-Rows'),
    productRows: numHeader(res, 'X-Order-Collection-Product-Rows'),
    outputRows: numHeader(res, 'X-Order-Collection-Output-Rows'),
    skippedRows: numHeader(res, 'X-Order-Collection-Skipped-Rows'),
  };
}

function numHeader(res: Response, name: string): number | null {
  const v = res.headers.get(name);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 생성된 .xls(Sheet1) 미리보기 행 추출 (쿠팡직배송 17컬럼). */
async function readPreviewRows(blob: Blob): Promise<string[][]> {
  const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets['Sheet1'] ?? wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | null | undefined>>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  // 0행 제목 / 1행 헤더 다음부터가 데이터. 헤더 포함 미리보기.
  return rows.slice(1, 25).map((row) => row.slice(0, 17).map((cell) => String(cell ?? '')));
}
