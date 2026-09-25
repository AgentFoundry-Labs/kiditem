import type { CoupangDirectCenter, CoupangDirectPurchaseOrder } from '@kiditem/shared/coupang-direct-order';
import {
  COUPANG_DIRECTSHIP_CHUNK_KIND,
  COUPANG_DIRECTSHIP_KIND,
  CoupangDirectshipPlanSchema,
  type CoupangDirectshipCaptureItem,
  type CoupangDirectshipPlan,
  type CoupangDirectshipProgress,
} from '@kiditem/shared/orders-operations';
import { RuntimeError, isRuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED } from '../../core/site-caller';
import { ChunkBuffer } from '../chunk-items';
import type { Collector } from '../collector';
import { registerCollector } from '../index';

/** 발주 목록 조회 조건(`sites/coupang-supplier`가 쿼리로 옮긴다). */
export interface DirectshipListQuery {
  searchDateType: 'WAREHOUSING_PLAN_DATE' | 'PURCHASE_ORDER_DATE';
  from: string;
  to: string;
  status: string;
}

/** 탭 다리가 펴 준 표(칸 글자·머리칸 여부). */
export interface DirectshipTable {
  text: string;
  rows: Array<{ section: string; cells: Array<{ text: string; rowSpan: number; header: boolean }> }>;
}

/** 이 수집기가 supplier 발주 화면에서 쓰는 것(`sites/coupang-supplier`가 구현, 입구가 넘긴다). */
export interface DirectshipSite {
  purchaseOrderListPage(query: DirectshipListQuery, pageNumber: number): Promise<{ rows: unknown[]; lastPageNumber: unknown }>;
  purchasableCenters(): Promise<unknown>;
  enterScmContext(poNumber: string): Promise<void>;
  purchaseOrderDetail(poNumber: string): Promise<DirectshipTable[]>;
  close(): Promise<void>;
}

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
/** 옛 수집과 같다: 목록 최대 40쪽, 입고예정일 오늘부터 30일, 상세 5개씩. */
const MAX_LIST_PAGES = 40;
const WINDOW_DAYS = 30;
const DETAIL_CONCURRENCY = 5;
const CHUNK_ITEMS = 200;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * `orders.coupang_directship`(KID-359): 옛 worker.js `collectCoupangDirectOrders`를 옮겼다. 발주확정(PA) 목록을
 * 입고예정일 오늘~30일(KST)로 최대 40쪽 읽고, 센터 주소표를 읽고, 탭을 첫 발주서 상세(/scm)로 옮긴 뒤 발주서마다
 * 품목을 5개씩 읽는다. 품목을 못 읽은 발주서는 빈 품목으로 남긴다(옛 규칙 — 변환이 그 유형을 거절한다). 발주서
 * 하나 = `orders_capture` 항목 하나, 끝에 센터표 항목 하나. 첫 쪽 뒤의 목록 실패는 거기서 멈춘다(옛 규칙).
 */
export const coupangDirectshipCollector: Collector<CoupangDirectshipPlan, Record<string, unknown>, DirectshipSite> = {
  kind: COUPANG_DIRECTSHIP_KIND,
  site: 'coupang-supplier',
  async *collect(rawPlan, site, { signal, report }) {
    if (!CoupangDirectshipPlanSchema.safeParse(rawPlan).success) {
      throw new RuntimeError(RUNTIME_PLAN_INVALID, '직배송 수집 계획이 올바르지 않습니다.', { kind: COUPANG_DIRECTSHIP_KIND });
    }
    if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, '서플라이어 허브 사이트를 쓸 수 없습니다.', { kind: COUPANG_DIRECTSHIP_KIND });
    try {
      const now = Date.now();
      const query: DirectshipListQuery = { searchDateType: 'WAREHOUSING_PLAN_DATE', from: kstDay(now, 0), to: kstDay(now, WINDOW_DAYS), status: 'PA' };
      const listed: CoupangDirectPurchaseOrder[] = [];
      for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
        if (signal.aborted) return;
        let body: { rows: unknown[]; lastPageNumber: unknown };
        try {
          body = await site.purchaseOrderListPage(query, page);
        } catch (error) {
          if (page === 1 || (isRuntimeError(error) && error.code === SITE_LOGIN_REQUIRED)) throw error;
          break;
        }
        for (const raw of body.rows) {
          const purchaseOrder = listedPurchaseOrder(raw);
          if (purchaseOrder) listed.push(purchaseOrder);
        }
        await report?.(progress('list', page, Math.min(Number(body.lastPageNumber) || 1, MAX_LIST_PAGES)));
        if (page >= (Number(body.lastPageNumber) || 1)) break;
      }
      const buffer = new ChunkBuffer<CoupangDirectshipCaptureItem>({ maxItems: CHUNK_ITEMS, label: '직배송 발주서' });
      if (listed.length === 0) {
        yield { chunkKind: COUPANG_DIRECTSHIP_CHUNK_KIND, payload: [{ centers: {} }], progress: progress('done', 0, 0) };
        return;
      }
      const centers = await site.purchasableCenters().then(centerMap, () => ({}));
      await site.enterScmContext(String(listed[0]!.seq));
      let detailed = 0;
      for (let offset = 0; offset < listed.length; offset += DETAIL_CONCURRENCY) {
        if (signal.aborted) return;
        const batch = await Promise.all(listed.slice(offset, offset + DETAIL_CONCURRENCY).map(async (purchaseOrder) => {
          try {
            return { ...purchaseOrder, items: detailItems(await site.purchaseOrderDetail(String(purchaseOrder.seq))) };
          } catch (error) {
            if (isRuntimeError(error) && error.code === SITE_LOGIN_REQUIRED) throw error;
            return { ...purchaseOrder, items: [] };
          }
        }));
        detailed += batch.length;
        for (const purchaseOrder of batch) {
          const full = buffer.push({ purchaseOrder });
          if (full) yield { chunkKind: COUPANG_DIRECTSHIP_CHUNK_KIND, payload: full, progress: progress('detail', detailed, listed.length) };
        }
        await report?.(progress('detail', detailed, listed.length));
      }
      if (signal.aborted) return;
      const rest = buffer.flush();
      if (rest) yield { chunkKind: COUPANG_DIRECTSHIP_CHUNK_KIND, payload: rest, progress: progress('detail', detailed, listed.length) };
      yield { chunkKind: COUPANG_DIRECTSHIP_CHUNK_KIND, payload: [{ centers }], progress: progress('done', detailed, listed.length) };
    } finally {
      await site.close();
    }
  },
};

function progress(phase: CoupangDirectshipProgress['phase'], current: number, total: number): CoupangDirectshipProgress {
  return { phase, current, total };
}

/** 오늘(KST)에서 `days`일 뒤의 `YYYY-MM-DD`. */
function kstDay(now: number, days: number): string {
  return new Date(now + KST_OFFSET_MS + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** UTC 시각을 KST 날짜로. 날짜만 오면 그대로(쿠팡은 2026-07-31T15:00:00Z = KST 08-01로 준다). */
function kstYmd(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return raw.slice(0, 10);
  return new Date(parsed + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 발주유형 긴급(쿠팡 purchaseOrderType = URGENT, 설명 "긴급"). 못 읽으면 일반. */
function isUrgent(row: Record<string, unknown>): boolean {
  const code = String(row.purchaseOrderType ?? '').trim().toUpperCase();
  if (code) return code === 'URGENT';
  return /긴급/.test(String(row.purchaseOrderTypeDescription ?? ''));
}

/** 목록 행 → 발주확정 발주서(품목은 상세에서). 발주확정이 아니면 null. */
function listedPurchaseOrder(raw: unknown): CoupangDirectPurchaseOrder | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const status = String(row.purchaseOrderStatus ?? row.purchaseOrderStatusCode ?? '').toUpperCase();
  const statusText = String(row.purchaseOrderStatusDescription ?? row.purchaseOrderStatusName ?? '');
  if (status && status !== 'PA') return null;
  if (!status && statusText && !/발주\s*확정/.test(statusText)) return null;
  return {
    seq: String(row.purchaseOrderSeq ?? ''),
    center: String(row.centerName ?? ''),
    transport: row.transportType as CoupangDirectPurchaseOrder['transport'],
    edd: kstYmd(row.expectedDeliveryDate),
    reg: kstYmd(row.createdAt) || String(row.createdAt ?? ''),
    status: (status || statusText || 'PA') as CoupangDirectPurchaseOrder['status'],
    urgent: isUrgent(row),
    items: [],
  };
}

/** 센터 목록 본문(`body` 배열 또는 `body.body`) → 센터명 → 주소·우편번호·연락처. */
function centerMap(value: unknown): Record<string, CoupangDirectCenter> {
  const body = (value as { body?: unknown } | null)?.body ?? value;
  const list = Array.isArray(body) ? body : (((body as { body?: unknown } | null)?.body) ?? []);
  const centers: Record<string, CoupangDirectCenter> = {};
  for (const center of Array.isArray(list) ? list : []) {
    const record = center as Record<string, unknown> | null;
    if (!record?.centerName) continue;
    const entry: CoupangDirectCenter = {};
    if (typeof record.address === 'string' && record.address.trim()) entry.addr = record.address.trim();
    if ((typeof record.zipCode === 'string' && record.zipCode.trim()) || typeof record.zipCode === 'number') {
      entry.zip = typeof record.zipCode === 'number' ? record.zipCode : String(record.zipCode).trim();
    }
    if (typeof record.contact === 'string' && record.contact.trim()) entry.contact = record.contact.trim();
    centers[String(record.centerName).trim()] = entry;
  }
  return centers;
}

/**
 * 상세 표 → 품목(옛 `parseItems`): "바코드" 머리가 있는 표의 행 중 셋째 칸이 `바코드(12~14자리) 상품명`인 행.
 * 칸 = [순번, 상품번호, 바코드 상품명, 매입유형, 발주수량, 납품가능, 매입가, …, 총발주매입금(10번째)].
 */
export function detailItems(tables: readonly DirectshipTable[]): CoupangDirectPurchaseOrder['items'] {
  const num = (value: string | undefined) => Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;
  for (const table of tables) {
    if (!/바코드/.test(table.text)) continue;
    const items: CoupangDirectPurchaseOrder['items'] = [];
    for (const row of table.rows) {
      const cells = row.cells.filter((cell) => !cell.header).map((cell) => cell.text.replace(/\s+/g, ' ').trim());
      const match = cells[2] ? /^(\d{12,14})\s+(.+)/.exec(cells[2]) : null;
      if (match) items.push({ skuId: cells[1] ?? '', barcode: match[1]!, name: match[2]!, qty: num(cells[4]), amount: num(cells[9]) });
    }
    if (items.length) return items;
  }
  return [];
}

registerCollector(coupangDirectshipCollector);
