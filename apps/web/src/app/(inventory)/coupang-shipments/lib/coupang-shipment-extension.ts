'use client';

import {
  detectOrderCollectionExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';
import {
  COUPANG_SHIPMENT_PAGE_URL,
  type CoupangShipmentFileDraft,
  type CoupangShipmentFileKind,
} from './coupang-shipment-files';

export interface CoupangShipmentDownloadRow {
  shipmentId: string;
  outboundAt: string;
  inboundDate: string;
  center: string;
  labelClicked: boolean;
  statementClicked: boolean;
}

export interface CoupangShipmentDownloadResult {
  success: boolean;
  url?: string;
  rows?: CoupangShipmentDownloadRow[];
  labelCount?: number;
  statementCount?: number;
  error?: string;
}

/**
 * 쿠팡 접속이 많아 쿠키가 커지면 supplier.coupang.com(Tomcat)이 요청 헤더 과다로 400 을
 * 반환한다. 확장이 이 코드로 알려주면 웹은 "쿠키 정리" 복구 흐름을 제안한다.
 */
export const COUPANG_COOKIE_BLOAT_CODE = 'coupang_cookie_bloat';

export class CoupangShipmentExtensionError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'CoupangShipmentExtensionError';
    this.code = code;
  }
}

export function isCoupangCookieBloatError(error: unknown): boolean {
  return error instanceof CoupangShipmentExtensionError && error.code === COUPANG_COOKIE_BLOAT_CODE;
}

/** 확장 응답의 errorCode 를 살펴 쿠키 과다면 타입드 에러, 아니면 일반 에러를 던진다. */
function throwExtensionError(response: { error?: string; errorCode?: string } | null, fallback: string): never {
  const message = response?.error ?? fallback;
  throw new CoupangShipmentExtensionError(message, response?.errorCode);
}

export async function openCoupangShipmentPageViaExtension(): Promise<string> {
  const extensionId = await getOrderCollectorExtensionId();
  const response = await sendToExtension<CoupangShipmentDownloadResult>(
    extensionId,
    { action: 'openCoupangShipmentPage', url: COUPANG_SHIPMENT_PAGE_URL },
    20000,
  );
  if (!response?.success) {
    throw new Error(response?.error ?? '쿠팡 쉽먼트 화면을 열지 못했습니다.');
  }
  return response.url ?? COUPANG_SHIPMENT_PAGE_URL;
}

export async function clickCoupangShipmentDownloadsViaExtension(params: {
  date?: string;
  labels: boolean;
  statements: boolean;
}): Promise<CoupangShipmentDownloadResult> {
  const extensionId = await getOrderCollectorExtensionId();
  const response = await sendToExtension<CoupangShipmentDownloadResult>(
    extensionId,
    {
      action: 'clickCoupangShipmentDownloads',
      date: params.date,
      labels: params.labels,
      statements: params.statements,
    },
    120000,
  );
  if (!response?.success) {
    throw new Error(response?.error ?? '쿠팡 쉽먼트 다운로드 실행에 실패했습니다.');
  }
  return response;
}

async function getOrderCollectorExtensionId(
  capability = 'coupangShipmentDownloads',
): Promise<string> {
  const extensionId = await detectOrderCollectionExtensionId(1200, capability);
  if (!extensionId) {
    throw new Error('주문수집 확장프로그램이 필요합니다. extensions/order-collector를 Chrome에서 로드한 뒤 다시 시도해주세요.');
  }
  return extensionId;
}

// ── 발송일 조회(달력용): 최근 쉽먼트를 발송일별 집계로 반환 ──
export interface CoupangShipmentDateSummaryItem {
  date: string; // YYYY-MM-DD (발송일)
  count: number;
  boxes: number;
}

interface CoupangShipmentDateSummaryResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  scannedPages?: number;
  totalRows?: number;
  dates?: CoupangShipmentDateSummaryItem[];
}

export async function collectCoupangShipmentDateSummaryViaExtension(): Promise<CoupangShipmentDateSummaryItem[]> {
  const extensionId = await getOrderCollectorExtensionId('collectCoupangShipmentFiles');
  const response = await sendToExtension<CoupangShipmentDateSummaryResult>(
    extensionId,
    { action: 'collectCoupangShipmentDateSummary' },
    90000,
  );
  if (!response?.success) throwExtensionError(response, '쿠팡 쉽먼트 발송일 조회에 실패했습니다.');
  return response.dates ?? [];
}

/**
 * 쿠키 과다(400)를 복구: supplier.coupang.com 쿠키를 정리한다(정리 후 재로그인 필요).
 * 반환값은 정리한 쿠키 수. 파괴적이라 호출 전 사용자 확인을 받는다.
 */
export async function clearCoupangCookiesViaExtension(): Promise<number> {
  // 쿠키 정리 기능(0.1.81+)을 명시적으로 요구 → 구버전 확장은 재로드 안내로 거절.
  const extensionId = await getOrderCollectorExtensionId('clearCoupangCookies');
  const response = await sendToExtension<{ success: boolean; cleared?: number; error?: string }>(
    extensionId,
    { action: 'clearCoupangCookies' },
    20000,
  );
  if (!response?.success) throw new Error(response?.error ?? '쿠팡 쿠키 정리에 실패했습니다.');
  return response.cleared ?? 0;
}

// ── 원클릭 자동 수집·병합 (직접 엔드포인트) ──
// 발송일 기준으로 쉽먼트 목록을 받고 각 Label/내역서 PDF 를 세션 fetch → 정확한 발송일·센터가 붙은
// 병합 대기 draft 로 반환한다. (화면 버튼 클릭 방식과 달리 파일명 파싱에 의존하지 않는다.)

export interface CoupangShipmentListItem {
  seq: string;
  status: string;
  outbound: string;
  inbound: string;
  center: string;
  boxes: string;
  qty: string;
  po: string;
  invoice: string;
}

interface CoupangShipmentListResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  date?: string;
  count?: number;
  scannedPages?: number;
  shipments?: CoupangShipmentListItem[];
}

interface CoupangShipmentPdfFile {
  seq: string;
  kind: 'label' | 'manifest';
  ok: boolean;
  error?: string;
  bytes?: number;
  b64?: string;
}

interface CoupangShipmentPdfBatchResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  files?: CoupangShipmentPdfFile[];
}

export interface CoupangShipmentCollectProgress {
  phase: 'list' | 'download' | 'build';
  date: string;
  loaded?: number;
  total?: number;
  shipmentCount?: number;
}

const PDF_FETCH_BATCH = 12; // (seq,kind) 항목 단위. 쉽먼트 6건 = PDF 12개씩.

export async function collectCoupangShipmentDraftsViaExtension(
  date: string,
  onProgress?: (progress: CoupangShipmentCollectProgress) => void,
): Promise<{ drafts: CoupangShipmentFileDraft[]; shipments: CoupangShipmentListItem[]; failed: string[] }> {
  if (!date) throw new Error('발송일을 선택해주세요.');
  const extensionId = await getOrderCollectorExtensionId('collectCoupangShipmentFiles');

  onProgress?.({ phase: 'list', date });
  const list = await sendToExtension<CoupangShipmentListResult>(
    extensionId,
    { action: 'collectCoupangShipmentList', date },
    90000,
  );
  if (!list?.success) throwExtensionError(list, '쿠팡 쉽먼트 목록 수집에 실패했습니다.');
  const shipments = list.shipments ?? [];
  if (shipments.length === 0) {
    throw new Error(`발송일 ${date} 에 해당하는 쉽먼트가 없습니다.`);
  }
  onProgress?.({ phase: 'download', date, loaded: 0, total: shipments.length * 2, shipmentCount: shipments.length });

  const items: Array<{ seq: string; kind: 'label' | 'manifest' }> = [];
  for (const shipment of shipments) {
    items.push({ seq: shipment.seq, kind: 'label' });
    items.push({ seq: shipment.seq, kind: 'manifest' });
  }

  const bySeqKind = new Map<string, CoupangShipmentPdfFile>();
  for (let offset = 0; offset < items.length; offset += PDF_FETCH_BATCH) {
    const slice = items.slice(offset, offset + PDF_FETCH_BATCH);
    const response = await sendToExtension<CoupangShipmentPdfBatchResult>(
      extensionId,
      { action: 'fetchCoupangShipmentPdfBatch', items: slice },
      120000,
    );
    if (!response?.success) throwExtensionError(response, '쿠팡 쉽먼트 PDF 수집에 실패했습니다.');
    for (const file of response.files ?? []) {
      if (file.ok && file.b64) bySeqKind.set(`${file.seq}:${file.kind}`, file);
    }
    onProgress?.({
      phase: 'download',
      date,
      loaded: Math.min(offset + PDF_FETCH_BATCH, items.length),
      total: items.length,
      shipmentCount: shipments.length,
    });
  }

  onProgress?.({ phase: 'build', date, shipmentCount: shipments.length });
  const drafts: CoupangShipmentFileDraft[] = [];
  const failed: string[] = [];
  for (const shipment of shipments) {
    for (const kind of ['label', 'manifest'] as const) {
      const file = bySeqKind.get(`${shipment.seq}:${kind}`);
      if (!file?.b64) {
        failed.push(`${shipment.seq}(${kind === 'label' ? 'Label' : '내역서'})`);
        continue;
      }
      const draftKind: CoupangShipmentFileKind = kind === 'label' ? 'label' : 'statement';
      const kindLabel = kind === 'label' ? 'Label' : '내역서';
      const center = shipment.center || '미분류';
      const name = `쿠팡쉽먼트_${date}_${center}_${shipment.seq}_${kindLabel}.pdf`;
      drafts.push({
        id: `${Date.now()}-${crypto.randomUUID()}`,
        file: new File([base64ToArrayBuffer(file.b64)], name, { type: 'application/pdf' }),
        name,
        kind: draftKind,
        shipmentDate: date,
        center,
      });
    }
  }
  if (drafts.length === 0) throw new Error('수집된 PDF가 없습니다.');
  return { drafts, shipments, failed };
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return buffer;
}
