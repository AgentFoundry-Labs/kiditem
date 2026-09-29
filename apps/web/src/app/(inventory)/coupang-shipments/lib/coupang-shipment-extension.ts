'use client';

import { detectOrderCollectionExtensionId } from '@/lib/extension-bridge';
import type { CoupangShipmentListRow } from '@kiditem/shared/orders-action-operations';
import { OrderActionFailure, readCoupangShipmentList } from '@/lib/order-action-operations';
import {
  CLEAR_COUPANG_COOKIES_ACTION,
  COUPANG_SHIPMENT_ACTIONS_CAPABILITY,
  ClearCoupangCookiesMessageSchema,
  ClearCoupangCookiesResponseSchema,
  FETCH_COUPANG_SHIPMENT_PDF_BATCH_ACTION,
  FetchCoupangShipmentPdfBatchMessageSchema,
  FetchCoupangShipmentPdfBatchResponseSchema,
  OPEN_COUPANG_SHIPMENT_PAGE_ACTION,
  OpenCoupangShipmentPageMessageSchema,
  OpenCoupangShipmentPageResponseSchema,
  type ExtensionActionFailure,
} from '@kiditem/shared/extension-actions';
import { sendExtensionEntryAction } from '@/lib/extension-entry-action';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import { SITE_COOKIE_BLOAT_CODE, SITE_LOGIN_REQUIRED_CODE } from '@/lib/coupang-shipment-summary-operation';
import {
  COUPANG_SHIPMENT_PAGE_URL,
  type CoupangShipmentFileDraft,
  type CoupangShipmentFileKind,
} from './coupang-shipment-files';

/**
 * 쿠팡 접속이 많아 쿠키가 커지면 supplier.coupang.com(Tomcat)이 요청 헤더 과다로 400 을
 * 반환한다. 확장이 이 코드로 알려주면 웹은 "쿠키 정리" 복구 흐름을 제안한다. 옛 파일 액션은
 * `coupang_cookie_bloat`, 실행 계약 조회(`orders.coupang_shipment_summary`)는 `SITE_COOKIE_BLOAT`로 알린다.
 */
export const COUPANG_COOKIE_BLOAT_CODES: ReadonlySet<string> = new Set(['coupang_cookie_bloat', SITE_COOKIE_BLOAT_CODE]);
export const COUPANG_SHIPMENT_SESSION_REQUIRED_CODES: ReadonlySet<string> = new Set(['coupang_shipment_session_required', SITE_LOGIN_REQUIRED_CODE]);

export class CoupangShipmentExtensionError extends Error {
  constructor(message: string, public code?: string | null) {
    super(message);
    this.name = 'CoupangShipmentExtensionError';
  }
}
export function isCoupangCookieBloatError(error: unknown): boolean {
  return error instanceof CoupangShipmentExtensionError && COUPANG_COOKIE_BLOAT_CODES.has(error.code ?? '');
}
export function isCoupangShipmentSessionRequiredError(error: unknown): boolean {
  return error instanceof CoupangShipmentExtensionError && COUPANG_SHIPMENT_SESSION_REQUIRED_CODES.has(error.code ?? '');
}

/** 발송일 달력 한 칸(미검증 기준 칸은 측정값이 없다). */
export interface CoupangShipmentDateSummaryItem {
  date: string;
  count: number | null;
  boxes: number | null;
}

const ORDER_COLLECTOR_REQUIRED_MESSAGE =
  '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os를 Chrome에서 로드한 뒤 다시 시도해주세요.';

const OPEN_SHIPMENT_PAGE = { message: OpenCoupangShipmentPageMessageSchema, response: OpenCoupangShipmentPageResponseSchema };
const FETCH_PDF_BATCH = { message: FetchCoupangShipmentPdfBatchMessageSchema, response: FetchCoupangShipmentPdfBatchResponseSchema };
const CLEAR_COOKIES = { message: ClearCoupangCookiesMessageSchema, response: ClearCoupangCookiesResponseSchema };

/** 확장 응답의 errorCode 를 살펴 쿠키 과다면 타입드 에러, 아니면 일반 에러를 던진다. */
function throwExtensionError(response: { error?: string; errorCode?: string } | ExtensionActionFailure | null, fallback: string): never {
  const message = response?.error ?? fallback;
  throw new CoupangShipmentExtensionError(message, response?.errorCode);
}

export async function openCoupangShipmentPageViaExtension(): Promise<string> {
  const extensionId = await getOrderCollectorExtensionId();
  const response = await sendExtensionEntryAction(
    extensionId,
    OPEN_SHIPMENT_PAGE,
    { action: OPEN_COUPANG_SHIPMENT_PAGE_ACTION, url: COUPANG_SHIPMENT_PAGE_URL },
    20000,
  );
  if (!response.success) throwExtensionError(response, '쿠팡 쉽먼트 화면을 열지 못했습니다.');
  return response.url;
}

async function getOrderCollectorExtensionId(): Promise<string> {
  const extensionId = await detectOrderCollectionExtensionId(1200, COUPANG_SHIPMENT_ACTIONS_CAPABILITY);
  if (!extensionId) {
    if (
      window.location.hostname === 'localhost'
      && window.location.port !== '3000'
    ) {
      throw new Error('주문수집 확장프로그램은 로컬 앱의 http://localhost:3000 에서 연결됩니다. 웹 앱을 3000 포트로 열어 다시 시도해주세요.');
    }
    throw new Error(ORDER_COLLECTOR_REQUIRED_MESSAGE);
  }
  return extensionId;
}

/**
 * 쿠키 과다(400)를 복구: supplier.coupang.com 쿠키를 정리한다(정리 후 재로그인 필요).
 * 반환값은 정리한 쿠키 수. 파괴적이라 호출 전 사용자 확인을 받는다.
 */
export async function clearCoupangCookiesViaExtension(): Promise<number> {
  const extensionId = await getOrderCollectorExtensionId();
  const response = await sendExtensionEntryAction(
    extensionId,
    CLEAR_COOKIES,
    { action: CLEAR_COUPANG_COOKIES_ACTION },
    20000,
  );
  if (!response.success) throw new Error(response.error);
  return response.cleared;
}

// ── 원클릭 자동 수집·병합 (직접 엔드포인트) ──
// 발송일 기준으로 쉽먼트 목록을 받고 각 Label/내역서 PDF 를 세션 fetch → 정확한 발송일·센터가 붙은
// 병합 대기 draft 로 반환한다. (화면 버튼 클릭 방식과 달리 파일명 파싱에 의존하지 않는다.)

/** 배송 목록 한 행(실행 `orders.coupang_shipment_list`의 result). */
export type CoupangShipmentListItem = CoupangShipmentListRow;

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
  const extensionId = await getOrderCollectorExtensionId();

  onProgress?.({ phase: 'list', date });
  // 배송 목록 = 실행 `orders.coupang_shipment_list`(KID-366). 실패 코드(쿠키 과다·로그인)는 화면 복구 흐름이 읽는 오류로 옮긴다.
  const list = await readCoupangShipmentList(date).catch((error: unknown) => {
    if (error instanceof OrderActionFailure) throw new CoupangShipmentExtensionError(error.message, error.code);
    throw error;
  });
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

  const bySeqKind = new Map<string, string>();
  for (let offset = 0; offset < items.length; offset += PDF_FETCH_BATCH) {
    const slice = items.slice(offset, offset + PDF_FETCH_BATCH);
    const response = await sendExtensionEntryAction(
      extensionId,
      FETCH_PDF_BATCH,
      { action: FETCH_COUPANG_SHIPMENT_PDF_BATCH_ACTION, items: slice },
      120000,
    );
    if (!response.success) throwExtensionError(response, '쿠팡 쉽먼트 PDF 수집에 실패했습니다.');
    for (const file of response.files) {
      if (file.ok && file.b64) bySeqKind.set(`${file.seq}:${file.kind}`, file.b64);
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
      const b64 = bySeqKind.get(`${shipment.seq}:${kind}`);
      if (!b64) {
        failed.push(`${shipment.seq}(${kind === 'label' ? 'Label' : '내역서'})`);
        continue;
      }
      const draftKind: CoupangShipmentFileKind = kind === 'label' ? 'label' : 'statement';
      const kindLabel = kind === 'label' ? 'Label' : '내역서';
      const center = shipment.center || '미분류';
      const name = `쿠팡쉽먼트_${date}_${center}_${shipment.seq}_${kindLabel}.pdf`;
      drafts.push({
        id: `${Date.now()}-${createSecureRandomUuid()}`,
        file: new File([base64ToArrayBuffer(b64)], name, { type: 'application/pdf' }),
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
