import * as XLSX from 'xlsx';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import type { OrderCollectionConversionResult } from './order-collection-api';
import { fileNameFromContentDisposition } from './order-collection-conversion-response';
import type { OrderCollectionExtensionRun } from './order-collection-extension';
import { waitForCoupangDirectCapture } from './coupang-directship-source-owner';
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

export type CoupangTransport = 'SHIPMENT' | 'MILKRUN';
export const COUPANG_TRANSPORT_LABEL: Record<CoupangTransport, string> = {
  SHIPMENT: '쉽먼트',
  MILKRUN: '밀크런',
};

export interface CoupangDirectConversionResult {
  file: OrderCollectionConversionResult | null;
  outputRows: number;
  workbookMatchedRows: number;
  workbookUnmatchedRows: number;
  importRunId: string;
  rocketWorkbookExportId: string | null;
  transmissionIntentKey: string | null;
}

/**
 * 쿠팡 공급사허브의 "발주확정(PA)" 발주 캡처(실행 kind `orders.coupang_directship`, KID-359). 확장은 실행을 시작할 때
 * 이미 수집을 돌리고 있다 — 여기서는 그 실행이 끝나기를 기다렸다가 서버가 보관한 캡처를 읽는다. 이미 끝난 실행(달력을
 * 다시 연 경우 등)은 곧바로 읽는다.
 */
export async function collectCoupangDirectFromExtension(run: OrderCollectionExtensionRun): Promise<CoupangDirectData> {
  const owner = await waitForCoupangDirectCapture(run.attemptId, { signal: run.signal });
  if (owner.attempt.state !== 'COMPLETE') {
    throw new Error('쿠팡직배송 원본 저장이 완료되지 않았습니다.');
  }
  return { pos: owner.capture.pos, centers: owner.capture.centers };
}

/** 수집한 발주 데이터를 운송유형별로 백엔드에서 셀피아 양식(.xls, 서식/시트 유지)으로 생성. */
export async function convertCoupangDirectToSellpiaFile(
  data: CoupangDirectData,
  transport: CoupangTransport,
  options: {
    channelAccountId: string;
    download?: boolean;
    signal?: AbortSignal;
    /** 이 캡처를 보관한 성공한 직배송 실행(`run.attemptId` = 실행 ID). */
    run: OrderCollectionExtensionRun;
  },
): Promise<CoupangDirectConversionResult> {
  const res = await apiClient.fetchRaw('/api/orders/collection/coupang-directship/convert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      operationId: options.run.attemptId,
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
  // 변환 기록은 실행 ID로 남는다(옛 import run 칸 이름을 그대로 쓴다).
  const importRunId = requiredHeader(res, 'X-Order-Collection-Operation-Id');
  const rocketWorkbookExportId = res.headers.get('X-Rocket-Workbook-Export-Id');
  const transmissionIntentKey = res.headers.get('X-Sellpia-Transmission-Intent-Key');
  const outputRows = numHeader(res, 'X-Order-Collection-Output-Rows') ?? 0;
  const workbookMatchedRows = numHeader(res, 'X-Rocket-Workbook-Matched-Rows') ?? 0;
  const workbookUnmatchedRows = numHeader(res, 'X-Rocket-Workbook-Unmatched-Rows') ?? 0;
  if (res.status === 204) {
    return {
      file: null,
      outputRows,
      workbookMatchedRows,
      workbookUnmatchedRows,
      importRunId,
      rocketWorkbookExportId,
      transmissionIntentKey,
    };
  }
  if (!transmissionIntentKey) {
    throw new Error('쿠팡 로켓 수집 식별 정보가 없어 셀피아 파일을 저장하지 않았습니다.');
  }
  const blob = await res.blob();
  const fileName = fileNameFromContentDisposition(res.headers.get('Content-Disposition'))
    ?? `쿠팡직배송_${COUPANG_TRANSPORT_LABEL[transport]}_셀피아변환.xls`;
  if (options?.download !== false) downloadBlob(blob, fileName);
  return {
    file: {
      fileName,
      blob,
      previewRows: await readPreviewRows(blob),
      sourceRows: numHeader(res, 'X-Order-Collection-Source-Rows'),
      productRows: numHeader(res, 'X-Order-Collection-Product-Rows'),
      outputRows: numHeader(res, 'X-Order-Collection-Output-Rows'),
      skippedRows: numHeader(res, 'X-Order-Collection-Skipped-Rows'),
      importRunId,
      rocketWorkbookExportId,
      transmissionIntentKey,
    },
    outputRows,
    workbookMatchedRows,
    workbookUnmatchedRows,
    importRunId,
    rocketWorkbookExportId,
    transmissionIntentKey,
  };
}

function requiredHeader(res: Response, name: string): string {
  const value = res.headers.get(name)?.trim();
  if (!value) {
    throw new Error('쿠팡 주문수집 저장 확인 정보가 없어 셀피아 파일을 저장하지 않았습니다.');
  }
  return value;
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
