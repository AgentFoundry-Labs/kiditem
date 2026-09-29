import * as XLSX from 'xlsx';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import { sellpiaProviderMatchesMall } from '@kiditem/shared/sellpia-providers';
import { fileNameFromContentDisposition } from './order-collection-conversion-response';

// 아이스크림몰 출고완료 업로드는 네이티브 파일 다이얼로그를 거쳐야 해 확장 자동화가 불가능하다.
// 파일만 만들어 주고 업로드는 화면의 [파일선택]으로 사람이 올린다(order-tracking-actions 참조).
// 예전 uploadIcecreamTrackingViaExtension 브리지는 실제 등록으로 이어지지 않아 제거했다.

/**
 * 아이스크림몰 송장 업로드(발송처리) — 비파괴 dry-run.
 * 셀피아 배송완료(송장) 스크랩 + 아이스크림 배송조회를 주문번호로 조인해 "출고완료 일괄등록" 파일을 만든다.
 * ⚠️이 단계는 파일만 생성/다운로드한다. 실제 아이스크림몰 업로드(발송완료 처리)는 검증 후 별도로 붙인다.
 */

export interface SellpiaTrackingRow {
  ordNo: string; // 원 판매처주문번호 (= 몰 주문번호, 조인키)
  itemNo: string; // 상품번호
  invNo: string; // 송장번호
  courier: string; // 셀피아 택배사코드 (예 1136=CJ)
  provider: string; // 판매처명 (몰 매핑용)
  receiver?: string; // 수취인
  post?: string; // 우편번호
  addr?: string; // 주소
}

/**
 * 전체 셀피아 송장 중 이 몰(판매처)의 것만. 몰→판매처 표는 shared(`@kiditem/shared/sellpia-providers`)가 든다 — 서버의
 * 송장 업로드 실행도 같은 표로 고른다(KID-366).
 */
export function filterTrackingByMall(rows: SellpiaTrackingRow[], mallKey: string): SellpiaTrackingRow[] {
  return rows.filter((row) => sellpiaProviderMatchesMall(row.provider, mallKey));
}

const COURIER_NAME: Record<string, string> = { '1136': 'CJ대한통운', '10': 'CJ대한통운' };
const COURIER_HDC: Record<string, string> = {
  '1136': '10',
  '10': '10',
  CJ대한통운: '10',
};
const TRACKING_CSV_HEADERS = [
  '주문번호',
  '수취인',
  '우편번호',
  '주소',
  '택배사',
  '택배사코드',
  '송장번호',
];

export function buildMallTrackingPreviewRows(rows: SellpiaTrackingRow[]): string[][] {
  return [
    TRACKING_CSV_HEADERS,
    ...rows.map((row) => [
      row.ordNo,
      row.receiver ?? '',
      row.post ?? '',
      row.addr ?? '',
      COURIER_NAME[row.courier] ?? row.courier,
      COURIER_HDC[row.courier] ?? '',
      row.invNo,
    ]),
  ];
}

/** 몰별 송장 파일(CSV, 엑셀 호환 BOM). 컬럼: 주문번호·수취인·우편번호·주소·택배사·택배사코드·송장번호. */
export function buildMallTrackingCsvBlob(rows: SellpiaTrackingRow[]): Blob {
  const esc = (value: string): string => {
    const cell = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/"/g, '""');
    return /[",]/.test(cell) ? `"${cell}"` : cell;
  };
  const lines = buildMallTrackingPreviewRows(rows).map((row) => row.map(esc).join(','));
  return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

export interface IcecreamSendFinishResult {
  fileName: string;
  blob: Blob;
  previewRows: string[][];
  sourceRows: number | null; // 아이스크림 배송조회 라인 수
  trackingRows: number | null; // 셀피아 송장 행 수
  matchedRows: number | null; // 송장 매칭된 라인 수 (= 파일 데이터 행)
  unmappedCouriers: string[]; // hdcCd 코드로 못 바꾼 택배사명 (검토 필요)
}

/** 아이스크림몰 출고완료 일괄등록 4열 xlsx를 서버에서 일회성 생성한다. */
export async function buildIcecreamSendFinishFile(
  headers: string[],
  rows: string[][],
  tracking: SellpiaTrackingRow[],
  options?: { download?: boolean; fileName?: string },
): Promise<IcecreamSendFinishResult> {
  const response = await apiClient.fetchRaw(
    '/api/orders/collection/icecream-mall/send-finish/convert',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        headers,
        rows,
        tracking,
        fileName: options?.fileName,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const blob = await response.blob();
  const fileName =
    fileNameFromContentDisposition(response.headers.get('Content-Disposition')) ??
    options?.fileName ??
    '아이스크림몰_출고완료.xlsx';
  const previewRows = await readWorkbookPreviewRows(blob);
  if (options?.download !== false) downloadBlob(blob, fileName);

  return {
    fileName,
    blob,
    previewRows,
    sourceRows: numericHeader(response, 'X-Order-Collection-Source-Rows') ?? rows.length,
    trackingRows: tracking.length,
    matchedRows:
      numericHeader(response, 'X-Order-Collection-Output-Rows') ??
      Math.max(previewRows.length - 1, 0),
    unmappedCouriers: [],
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  const body = (await response.clone().json().catch(() => null)) as { message?: unknown } | null;
  if (typeof body?.message === 'string') return body.message;
  return `파일 생성 실패 (${response.status})`;
}

async function readWorkbookPreviewRows(blob: Blob): Promise<string[][]> {
  const workbook = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null | undefined>>(
    sheet,
    { header: 1, raw: false, defval: '' },
  );
  return rows.map((row) => row.map((value) => String(value ?? '')));
}

function numericHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
