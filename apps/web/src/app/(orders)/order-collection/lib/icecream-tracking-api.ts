import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import type { OrderCollectionExtensionRun } from './order-collection-extension';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';

// ── 도매꾹 송장 업로드(발송처리): 셀피아 송장 → 도매꾹 엑셀양식 → 확장이 shipXls 업로드 ──

export interface DomeggookShipBuild {
  fileName: string;
  blob: Blob;
  base64: string;
  orderNos: string[];
  rowCount: number;
  unmappedCouriers: string[];
}

/** 셀피아 송장(도매꾹)으로 "송장 엑셀일괄입력" 파일 생성. download!==false 면 다운로드도. base64 는 확장 업로드용. */
export async function buildDomeggookShipFile(
  tracking: SellpiaTrackingRow[],
  options?: { download?: boolean },
): Promise<DomeggookShipBuild> {
  const response = await apiClient.fetchRaw('/api/orders/collection/domeggook/ship-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tracking }),
  });
  if (!response.ok) {
    const body = (await response.clone().json().catch(() => null)) as { message?: unknown } | null;
    throw new Error(typeof body?.message === 'string' ? body.message : `파일 생성 실패 (${response.status})`);
  }
  const blob = await response.blob();
  const fileName =
    fileNameFromContentDisposition(response.headers.get('Content-Disposition')) ?? '도매꾹_송장.xls';
  if (options?.download !== false) downloadBlob(blob, fileName);
  return {
    fileName,
    blob,
    base64: await blobToBase64(blob),
    orderNos: decodeCsvHeader(response, 'X-Domeggook-Ship-Order-Nos'),
    rowCount: numericHeader(response, 'X-Domeggook-Ship-Row-Count') ?? 0,
    unmappedCouriers: decodeCsvHeader(response, 'X-Domeggook-Ship-Unmapped-Couriers'),
  };
}

/** ⚠️파괴적: 확장이 도매꾹 shipXls 로 실제 발송처리. 프론트가 사용자 확인 후에만 호출. */
export async function uploadDomeggookTrackingViaExtension(
  fileBase64: string,
  fileName: string,
  orderNos: string[],
): Promise<{ uploaded?: boolean; httpStatus?: number; snippet?: string }> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error('주문수집 확장프로그램이 필요합니다. domeggook.com 로그인 후 다시 시도하세요.');
  }
  const res = await sendToExtension<{
    success?: boolean;
    uploaded?: boolean;
    httpStatus?: number;
    snippet?: string;
    error?: string;
  }>(extensionId, { action: 'uploadDomeggookTracking', fileBase64, fileName, orderNos }, 90000);
  if (!res?.success) throw new Error(res?.error ?? '도매꾹 송장 업로드에 실패했습니다.');
  return { uploaded: res.uploaded, httpStatus: res.httpStatus, snippet: res.snippet };
}

export interface OnchUploadResultRow {
  ordNo: string;
  ok: boolean;
  reason?: string;
}

/** ⚠️파괴적: 확장이 온채널 목록을 스크랩해 주문당 trans_ok 로 송장 등록. 프론트가 사용자 확인 후에만 호출. */
export async function uploadOnchTrackingViaExtension(rows: SellpiaTrackingRow[]): Promise<{
  total: number;
  okCount: number;
  listSize: number;
  results: OnchUploadResultRow[];
}> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error('주문수집 확장프로그램이 필요합니다. www.onch3.co.kr 로그인 후 다시 시도하세요.');
  }
  const payload = rows.map((row) => ({ ordNo: row.ordNo, invNo: row.invNo, courier: row.courier }));
  const res = await sendToExtension<{
    success?: boolean;
    total?: number;
    okCount?: number;
    listSize?: number;
    results?: OnchUploadResultRow[];
    error?: string;
  }>(extensionId, { action: 'uploadOnchTracking', rows: payload }, 130000);
  if (!res?.success) throw new Error(res?.error ?? '온채널 송장 업로드에 실패했습니다.');
  return {
    total: res.total ?? rows.length,
    okCount: res.okCount ?? 0,
    listSize: res.listSize ?? 0,
    results: Array.isArray(res.results) ? res.results : [],
  };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < buf.length; i += CH) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CH)));
  }
  return btoa(bin);
}

function decodeCsvHeader(response: Response, name: string): string[] {
  const raw = response.headers.get(name);
  if (!raw) return [];
  try {
    return decodeURIComponent(raw)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

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

// 몰 key → 셀피아 판매처명(부분일치). 셀피아 송장재출력의 판매처명 기준(라이브 확인).
const SELLPIA_PROVIDER_BY_MALL: Record<string, string[]> = {
  'icecream-mall': ['아이스크림몰'],
  'teacher-mall': ['테크빌', '키즈티쳐'], // 테크빌교육(키즈티쳐몰)
  kidsnote: ['키즈노트'],
  onch: ['온채널'],
  art09: ['아트공구'],
  boribori: ['보리보리'],
  domeggook: ['도매꾹'],
  'lotte-on': ['롯데온', '롯데on'],
  kkomangse: ['꼬망세'],
  kakao: ['카카오'],
  'coupang-direct': ['쿠팡-직배송', '쿠팡직배송'],
  'gs-shop': ['gs샵'],
  kidkids: ['키드키즈'], // 아직 셀피아 송장 미확인(발송 시 매핑)
  always: ['올웨이즈', '이레빗'],
};

/** 이 몰이 송장 업로드(셀피아 송장 소스) 지원 대상인지. */
export function isTrackingSupportedMall(mallKey: string): boolean {
  return mallKey in SELLPIA_PROVIDER_BY_MALL;
}

/** 전체 셀피아 송장 중 이 몰(판매처)의 것만 필터. */
export function filterTrackingByMall(rows: SellpiaTrackingRow[], mallKey: string): SellpiaTrackingRow[] {
  const keys = SELLPIA_PROVIDER_BY_MALL[mallKey];
  if (!keys) return [];
  return rows.filter((row) => {
    const provider = (row.provider || '').toLowerCase();
    return keys.some((key) => provider.includes(key.toLowerCase()));
  });
}

const COURIER_NAME: Record<string, string> = { '1136': 'CJ대한통운' };
const COURIER_HDC: Record<string, string> = { '1136': '10' };

/** 몰별 송장 파일(CSV, 엑셀 호환 BOM). 컬럼: 주문번호·수취인·우편번호·주소·택배사·택배사코드·송장번호. */
export function buildMallTrackingCsvBlob(rows: SellpiaTrackingRow[]): Blob {
  const esc = (value: string): string => {
    const cell = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/"/g, '""');
    return /[",]/.test(cell) ? `"${cell}"` : cell;
  };
  const header = ['주문번호', '수취인', '우편번호', '주소', '택배사', '택배사코드', '송장번호'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        esc(row.ordNo),
        esc(row.receiver ?? ''),
        esc(row.post ?? ''),
        esc(row.addr ?? ''),
        esc(COURIER_NAME[row.courier] ?? row.courier),
        esc(COURIER_HDC[row.courier] ?? ''),
        esc(row.invNo),
      ].join(','),
    );
  }
  return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

interface SellpiaTrackingResponse {
  success?: boolean;
  rows?: SellpiaTrackingRow[];
  total?: number;
  range?: { start: string; end: string };
  error?: string;
}

/**
 * 확장이 셀피아 **송장 재출력(order_delivery_reprint)** 에서 채번된 송장번호를 가져온다.
 * 채번 화면(대기 리스트)은 리로드하면 채번된 주문이 빠지므로, 지속 소스인 재출력을
 * '송장번호채번일자' 기준으로 조회한다(채번 직후 출력 전 주문도 포함).
 */
export async function collectSellpiaDeliTrackingFromExtension(options?: {
  startDate?: string;
  endDate?: string;
  run?: OrderCollectionExtensionRun;
}): Promise<SellpiaTrackingRow[]> {
  const extensionId = options?.run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector를 Chrome에 로드하고 kiditem.sellpia.com에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<SellpiaTrackingResponse>(
    extensionId,
    {
      action: 'collectSellpiaDeliTracking',
      startDate: options?.startDate ?? null,
      endDate: options?.endDate ?? null,
      runId: options?.run?.runId ?? globalThis.crypto.randomUUID(),
    },
    90000,
  );
  if (!res?.success || !Array.isArray(res.rows)) {
    throw new Error(res?.error ?? '셀피아 송장 조회에 실패했습니다.');
  }
  return res.rows;
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

/** 조인+파일생성을 백엔드에 위임 → 아이스크림몰 출고완료 일괄등록 xlsx 반환 (다운로드는 옵션). */
export async function buildIcecreamSendFinishFile(
  headers: string[],
  rows: string[][],
  tracking: SellpiaTrackingRow[],
  options?: { download?: boolean },
): Promise<IcecreamSendFinishResult> {
  const response = await apiClient.fetchRaw('/api/orders/collection/icecream-mall/sendfinish-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ headers, rows, tracking }),
  });
  if (!response.ok) {
    const body = (await response.clone().json().catch(() => null)) as { message?: unknown } | null;
    throw new Error(typeof body?.message === 'string' ? body.message : `파일 생성 실패 (${response.status})`);
  }

  const blob = await response.blob();
  const fileName =
    fileNameFromContentDisposition(response.headers.get('Content-Disposition')) ??
    '아이스크림몰_송장업로드.xlsx';
  if (options?.download !== false) downloadBlob(blob, fileName);

  return {
    fileName,
    blob,
    previewRows: await readPreviewRows(blob),
    sourceRows: numericHeader(response, 'X-Icecream-SendFinish-Source-Rows'),
    trackingRows: numericHeader(response, 'X-Icecream-SendFinish-Tracking-Rows'),
    matchedRows: numericHeader(response, 'X-Icecream-SendFinish-Matched-Rows'),
    unmappedCouriers: unmappedCouriersHeader(response),
  };
}

function numericHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function unmappedCouriersHeader(response: Response): string[] {
  const raw = response.headers.get('X-Icecream-SendFinish-Unmapped-Couriers');
  if (!raw) return [];
  try {
    return decodeURIComponent(raw)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function fileNameFromContentDisposition(value: string | null): string | null {
  if (!value) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return /filename="([^"]+)"/i.exec(value)?.[1] ?? null;
}

async function readPreviewRows(blob: Blob): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null | undefined>>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  return rows.slice(0, 24).map((row) => row.slice(0, 4).map((cell) => String(cell ?? '')));
}
