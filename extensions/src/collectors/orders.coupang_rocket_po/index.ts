import {
  COUPANG_ROCKET_PO_CHUNK_KIND,
  COUPANG_ROCKET_PO_KIND,
  COUPANG_ROCKET_PO_SCAN_CHUNK_KIND,
  CoupangRocketPoPlanSchema,
  type CoupangRocketPoChunkItem,
  type CoupangRocketPoPlan,
  type CoupangRocketPoProgress,
  type CoupangRocketPoScan,
} from '@kiditem/shared/orders-operations';
import type { RocketPoCatalogRow } from '@kiditem/shared/rocket-purchase-preview';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { Collector } from '../collector';
import { registerCollector } from '../index';

/** 발주 목록 조회 조건(`sites/coupang-supplier`가 쿼리로 옮긴다). */
export interface SupplierPoListQuery {
  searchDateType: 'WAREHOUSING_PLAN_DATE' | 'PURCHASE_ORDER_DATE';
  from: string;
  to: string;
  status: string;
}

/** 탭 다리가 펴 준 표(칸 글자·rowspan). */
export interface SupplierTable {
  text: string;
  rows: Array<{ section: string; cells: Array<{ text: string; rowSpan: number; header: boolean }> }>;
}

/** 이 수집기가 supplier 발주 화면에서 쓰는 것(`sites/coupang-supplier`가 구현, 입구가 넘긴다). */
export interface SupplierPoSite {
  purchaseOrderListPage(query: SupplierPoListQuery, pageNumber: number): Promise<{ rows: unknown[]; lastPageNumber: unknown }>;
  purchaseOrderDetail(poNumber: string): Promise<SupplierTable[]>;
  close(): Promise<void>;
}

/** 목록·상세가 맞지 않거나 필수 칸이 없다 — 부분 행을 올리지 않고 실행을 실패시킨다(옛 `rocket_po_collection_incomplete`). */
export const ROCKET_PO_COLLECTION_INCOMPLETE = 'ROCKET_PO_COLLECTION_INCOMPLETE' as const;
const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
/** 옛 수집과 같다: 상세는 5개씩 함께. */
const DETAIL_CONCURRENCY = 5;
/** 청크 하나의 발주서 수. */
const CHUNK_PURCHASE_ORDERS = 200;

type ListedPo = {
  poNumber: string;
  vendorId: string;
  purchaseOrderStatus: string;
  plannedDeliveryDate: string;
  listSkuCount: number;
  listOrderQty: number;
  listOrderAmount: number;
  centerName: unknown;
  transportTypeDescription: unknown;
  purchaseOrderStatusDescription: unknown;
  createdAt: unknown;
};

/**
 * `orders.coupang_rocket_po`(KID-359): 옛 `rocket-po-collection.js`를 옮겼다. 발주 목록을 plan의 기간·상태·날짜 기준으로
 * 끝까지 읽고(도중에 전체 쪽 수가 바뀌면 실패), 발주서마다 상세를 5개씩 읽어 SKU 행을 만든다. 상세 합계가 목록과
 * 다르면 한 번 더 읽는다. 발주서 하나 = `po_rows` 항목 하나, 끝에 목록 증거 `po_scan` 하나. 완결 판정은 서버가 한다.
 */
export const coupangRocketPoCollector: Collector<CoupangRocketPoPlan, Record<string, unknown>, SupplierPoSite> = {
  kind: COUPANG_ROCKET_PO_KIND,
  site: 'coupang-supplier',
  async *collect(rawPlan, site, { signal, report }) {
    const parsed = CoupangRocketPoPlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw new RuntimeError(RUNTIME_PLAN_INVALID, '로켓 발주 수집 계획이 올바르지 않습니다.', { kind: COUPANG_ROCKET_PO_KIND });
    if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, '서플라이어 허브 사이트를 쓸 수 없습니다.', { kind: COUPANG_ROCKET_PO_KIND });
    const plan = parsed.data;
    try {
      const query: SupplierPoListQuery = { searchDateType: plan.dateType, from: plan.from, to: plan.to, status: plan.status };
      const listed: ListedPo[] = [];
      const seen = new Set<string>();
      let totalListPages: number | null = null;
      let listPagesRead = 0;
      for (let page = 1; ; page += 1) {
        if (signal.aborted) return;
        const body = await site.purchaseOrderListPage(query, page);
        const pageCount = requiredInteger(body.lastPageNumber, '발주 목록 전체 쪽 수');
        if (pageCount < 1 || pageCount > 100_000) throw incomplete('발주 목록 전체 쪽 수가 올바르지 않습니다.');
        totalListPages ??= pageCount;
        if (totalListPages !== pageCount) throw incomplete('수집하는 동안 발주 목록 쪽 수가 바뀌었습니다.');
        listPagesRead = page;
        for (const raw of body.rows) {
          const po = listedPo(raw, plan.status, page);
          if (seen.has(po.poNumber)) throw incomplete(`발주서 ${po.poNumber}가 목록에 두 번 있습니다.`);
          seen.add(po.poNumber);
          listed.push(po);
        }
        await report?.(progress('list', page, pageCount));
        if (page >= totalListPages) break;
      }
      const vendorIds = listed.map((po) => po.vendorId);
      const vendorId = vendorIds.length > 0 && new Set(vendorIds).size === 1 ? vendorIds[0]! : '';
      if (listed.length > 0 && !vendorId) throw incomplete('발주 목록의 공급자 ID가 비었거나 섞여 있습니다.');

      const businessDateBasis = plan.dateType === 'PURCHASE_ORDER_DATE' ? 'ordered_at' : 'expected_inbound';
      const buffer = new ChunkBuffer<CoupangRocketPoChunkItem>({ maxItems: CHUNK_PURCHASE_ORDERS, label: '발주서' });
      let detailed = 0;
      for (let offset = 0; offset < listed.length; offset += DETAIL_CONCURRENCY) {
        if (signal.aborted) return;
        const batch = await Promise.all(listed.slice(offset, offset + DETAIL_CONCURRENCY).map(async (po) => ({
          po,
          rows: await detailWithRetry(site, po, businessDateBasis),
        })));
        detailed += batch.length;
        for (const { po, rows } of batch) {
          const full = buffer.push({ poNumber: po.poNumber, rows });
          if (full) yield { chunkKind: COUPANG_ROCKET_PO_CHUNK_KIND, payload: full, progress: progress('detail', detailed, listed.length) };
        }
        await report?.(progress('detail', detailed, listed.length));
      }
      if (signal.aborted) return;
      const rest = buffer.flush();
      if (rest) yield { chunkKind: COUPANG_ROCKET_PO_CHUNK_KIND, payload: rest, progress: progress('detail', detailed, listed.length) };
      const scan: CoupangRocketPoScan = {
        vendorId,
        listPagesRead,
        totalListPages: totalListPages ?? 0,
        detailPoCount: detailed,
        proof: { from: plan.from, to: plan.to, status: plan.status, dateType: plan.dateType, validatedList: true },
      };
      yield { chunkKind: COUPANG_ROCKET_PO_SCAN_CHUNK_KIND, payload: [scan], progress: progress('done', detailed, listed.length) };
    } finally {
      await site.close();
    }
  },
};

function progress(phase: CoupangRocketPoProgress['phase'], current: number, total: number): CoupangRocketPoProgress {
  return { phase, current, total };
}

function listedPo(raw: unknown, status: string, page: number): ListedPo {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw incomplete(`발주 목록 ${page}쪽에 올바르지 않은 행이 있습니다.`);
  const row = raw as Record<string, unknown>;
  const poNumber = requiredText(row.purchaseOrderSeq, '발주서 번호');
  const purchaseOrderStatus = requiredText(row.purchaseOrderStatus || row.purchaseOrderStatusCode, `발주서 ${poNumber} 상태`).toUpperCase();
  if (status && purchaseOrderStatus !== status) throw incomplete(`발주서 ${poNumber}가 ${status} 조회에 ${purchaseOrderStatus} 상태로 왔습니다.`);
  return {
    poNumber,
    vendorId: requiredText(row.vendorId, `발주서 ${poNumber} 공급자 ID`),
    purchaseOrderStatus,
    plannedDeliveryDate: requiredDate(row.expectedDeliveryDate, `발주서 ${poNumber} 입고예정일`),
    listSkuCount: requiredInteger(row.skuCount, `발주서 ${poNumber} SKU 수`),
    listOrderQty: requiredInteger(row.sumOfOrderQty, `발주서 ${poNumber} 발주 수량`),
    listOrderAmount: requiredInteger(row.sumOfOrderAmount, `발주서 ${poNumber} 발주 금액`),
    centerName: row.centerName,
    transportTypeDescription: row.transportTypeDescription,
    purchaseOrderStatusDescription: row.purchaseOrderStatusDescription,
    createdAt: row.createdAt,
  };
}

class DetailMismatch extends Error {}

async function detailWithRetry(site: SupplierPoSite, po: ListedPo, basis: RocketPoCatalogRow['businessDateBasis']): Promise<RocketPoCatalogRow[]> {
  try {
    return detailRows(await site.purchaseOrderDetail(po.poNumber), po, basis);
  } catch (error) {
    if (!(error instanceof DetailMismatch)) throw error;
    try {
      return detailRows(await site.purchaseOrderDetail(po.poNumber), po, basis);
    } catch (again) {
      if (again instanceof DetailMismatch) throw incomplete(again.message);
      throw again;
    }
  }
}

/**
 * 상세 표 → SKU 행(옛 `parseDetail`). 첫 칸이 rowspan>1인 SKU 행 뒤의 이어지는 행은 첫 칸이 빠져 숫자로 시작할 수
 * 있으므로, 첫 칸의 rowspan이 행의 주인을 정한다. 숫자로 시작하는 행은 모두 검증한다. 목록의 SKU 수·수량·금액과
 * 다르면 `DetailMismatch`(한 번 더 읽는다).
 */
export function detailRows(tables: readonly SupplierTable[], po: ListedPo, basis: RocketPoCatalogRow['businessDateBasis']): RocketPoCatalogRow[] {
  const returnTable = tables.find((table) => /회송\s*담당자/.test(table.text) && /회송지/.test(table.text));
  const returnRow = returnTable?.rows[1]?.cells.map((cell) => norm(cell.text)) ?? ['', '', ''];
  const skuTable = tables.find((table) => /상품\s*번호/.test(table.text) && /발주금액/.test(table.text));
  const rows: RocketPoCatalogRow[] = [];
  const lineNumbers = new Set<string>();
  const products = new Set<string>();
  let orderQtyTotal = 0;
  let orderAmountTotal = 0;
  let skip = 0;
  for (const raw of skuTable?.rows ?? []) {
    if (skip > 0) {
      skip -= 1;
      continue;
    }
    const values = raw.cells.map((cell) => norm(cell.text));
    const rowSpan = Number(raw.cells[0]?.rowSpan ?? 1);
    if (!Number.isInteger(rowSpan) || rowSpan < 1) throw incomplete(`발주서 ${po.poNumber}의 첫 칸 rowspan이 올바르지 않습니다.`);
    skip = rowSpan - 1;
    if (!/^\d+$/.test(values[0] ?? '')) continue;
    if (values.length <= 9) throw incomplete(`발주서 ${po.poNumber}에 칸이 모자란 SKU 행이 있습니다.`);
    const lineNumber = requiredText(values[0], `발주서 ${po.poNumber} 줄 번호`);
    if (lineNumbers.has(lineNumber)) throw incomplete(`발주서 ${po.poNumber}에 같은 줄 번호가 두 번 있습니다.`);
    lineNumbers.add(lineNumber);
    const productNo = requiredText(values[1], `발주서 ${po.poNumber} 상품번호`);
    const productText = requiredText(values[2], `발주서 ${po.poNumber} 상품`);
    const barcode = (/^\d{8,}/.exec(productText) ?? [''])[0];
    const productName = clean(productText, 240);
    if (!productName) throw incomplete(`발주서 ${po.poNumber}의 상품명이 없습니다.`);
    const identity = `${productNo}\u0000${barcode}`;
    if (products.has(identity)) throw incomplete(`발주서 ${po.poNumber}에 같은 상품 줄이 두 번 있습니다.`);
    products.add(identity);
    const orderQty = requiredInteger(values[4], `발주서 ${po.poNumber} 발주 수량`);
    const purchasePrice = requiredInteger(values[6], `발주서 ${po.poNumber} 매입가`);
    const supplyPrice = requiredInteger(values[7], `발주서 ${po.poNumber} 공급가`);
    const vat = requiredInteger(values[8], `발주서 ${po.poNumber} 부가세`);
    const totalPurchase = requiredInteger(values[9], `발주서 ${po.poNumber} 발주 금액`);
    orderQtyTotal += orderQty;
    orderAmountTotal += totalPurchase;
    rows.push({
      poLineId: [po.poNumber, productNo, barcode, lineNumber].join(':'),
      poNumber: po.poNumber,
      vendorId: po.vendorId,
      productNo,
      barcode,
      productName,
      orderQty,
      plannedDeliveryDate: po.plannedDeliveryDate,
      poStatusCode: po.purchaseOrderStatus,
      ...(basis ? { businessDateBasis: basis } : {}),
      confirmation: {
        center: clean(po.centerName, 120),
        inboundType: clean(po.transportTypeDescription, 80),
        poStatus: clean(po.purchaseOrderStatusDescription, 80),
        returnManager: clean(returnRow[0], 120),
        returnContact: clean(returnRow[1], 80),
        returnAddress: clean(returnRow[2], 300),
        purchasePrice,
        supplyPrice,
        vat,
        totalPurchase,
        poRegisteredAt: String(po.createdAt ?? '').replace('T', ' ').slice(0, 19),
        xdock: 'N',
      },
    });
  }
  if (!skuTable || rows.length === 0) throw new DetailMismatch(`발주서 ${po.poNumber} 상세에 SKU 행이 없습니다.`);
  if (rows.length !== po.listSkuCount || orderQtyTotal !== po.listOrderQty || orderAmountTotal !== po.listOrderAmount) {
    throw new DetailMismatch(
      `발주서 ${po.poNumber}의 목록·상세 합계가 다릅니다(SKU ${rows.length}/${po.listSkuCount}, 수량 ${orderQtyTotal}/${po.listOrderQty}, 금액 ${orderAmountTotal}/${po.listOrderAmount}).`,
    );
  }
  return rows;
}

function incomplete(message: string): RuntimeError {
  return new RuntimeError(ROCKET_PO_COLLECTION_INCOMPLETE, message.slice(0, 300), {});
}

function norm(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** 제어 문자를 지우고 앞의 8자리 이상 숫자(바코드)를 떼어 낸다(옛 `clean`). */
function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001F]/g, ' ')
    .replace(/^\d{8,}\s*/, '')
    .trim()
    .slice(0, max);
}

function requiredText(value: unknown, field: string): string {
  const text = norm(value);
  if (!text) throw incomplete(`${field}가 없습니다.`);
  return text;
}

function requiredInteger(value: unknown, field: string): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw incomplete(`${field}가 없거나 올바르지 않습니다.`);
    return value;
  }
  if (typeof value !== 'string') throw incomplete(`${field}가 없거나 올바르지 않습니다.`);
  const raw = value.trim();
  if (!raw || (!/^\d+$/.test(raw) && !/^\d{1,3}(?:,\d{3})+$/.test(raw))) throw incomplete(`${field}가 없거나 올바르지 않습니다.`);
  const parsed = Number(raw.replace(/,/g, ''));
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw incomplete(`${field}가 범위를 벗어났습니다.`);
  return parsed;
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `YYYY-MM-DD`는 그대로, ISO 시각은 KST 날짜로(옛 `requiredDate`). */
function requiredDate(value: unknown, field: string): string {
  if (typeof value !== 'string') throw incomplete(`${field}가 올바르지 않습니다.`);
  const raw = value.trim();
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (day) {
    if (!isCalendarDate(Number(day[1]), Number(day[2]), Number(day[3]))) throw incomplete(`${field}가 올바르지 않습니다.`);
    return raw;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(raw);
  const parsed = iso ? Date.parse(raw) : Number.NaN;
  if (!iso || !isCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) || Number.isNaN(parsed)) throw incomplete(`${field}가 올바르지 않습니다.`);
  return new Date(parsed + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

registerCollector(coupangRocketPoCollector);
