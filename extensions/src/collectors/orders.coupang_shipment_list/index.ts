import {
  COUPANG_SHIPMENT_LIST_CHUNK_KIND,
  COUPANG_SHIPMENT_LIST_KIND,
  COUPANG_SHIPMENT_LIST_ROWS_MAX,
  CoupangShipmentListPlanSchema,
  type CoupangShipmentListPlan,
  type CoupangShipmentListResult,
  type CoupangShipmentListRow,
} from '@kiditem/shared/orders-action-operations';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { CollectedChunk, CollectFinish, Collector } from '../collector';
import { registerCollector } from '../index';

/** 쉽먼트 목록 한 행(`sites/coupang-supplier` `parseParcelPage` — 칸 글자 그대로). */
export interface ShipmentListParcelRow {
  seq: string;
  outbound: string;
  boxes: string;
  center: string;
  status: string | null;
}

/** 이 수집기가 supplier에서 쓰는 것(`sites/coupang-supplier`가 구현, 로그인은 실행 자격으로 사이트가 한 번 한다). */
export interface ShipmentListSite {
  parcelPage(pageNumber: number): Promise<ShipmentListParcelRow[]>;
  close(): Promise<void>;
}

/** finish result — 행은 청크에만 있고 owner finalize가 청크와 이것을 합친다(T2와 맞춘 모양). */
type ShipmentListFinishResult = Pick<CoupangShipmentListResult, 'scannedPages' | 'stopReason'>;

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
/** 옛 규칙: 10행보다 짧은 쪽이 마지막 쪽, 대상 블록 뒤 2쪽 연속 0건이면 블록이 끝났다. */
const FULL_PAGE_ROWS = 10;
const PAST_BLOCK_EMPTY_PAGES = 2;
const CHUNK_ROWS = 500;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `orders.coupang_shipment_list`(KID-366 wave8b, 옛 워커의 쿠팡 배송 목록 액션과 `scrapeCoupangShipmentList`): 공급사 택배
 * 쉽먼트 목록을 필터 없이 1쪽부터 차례로 읽어(입고예정일 필터는 발송일과 1:1이 아니라 누락) 발송일이 plan 날짜인 행만 seq 한
 * 번씩 모은다. 멈춤: 빈 쪽(`empty_pages`), 대상 블록을 지난 뒤 2쪽 연속 0건(`past_date_block`), 10행보다 짧은 쪽
 * (`short_page`), 쪽 상한(`max_pages`, 60). 백그라운드 탭(사이트가 열고 닫는다), 쿠키 과다는 사이트의 `SITE_COOKIE_BLOAT`.
 * 행은 `shipment_rows` 청크, 어디서 멈췄는지는 finish result.
 */
export const coupangShipmentListCollector: Collector<CoupangShipmentListPlan, ShipmentListFinishResult, ShipmentListSite> = {
  kind: COUPANG_SHIPMENT_LIST_KIND,
  site: 'coupang-supplier',
  async *collect(rawPlan, site, { signal }): AsyncGenerator<CollectedChunk, CollectFinish<ShipmentListFinishResult> | void, undefined> {
    const parsed = CoupangShipmentListPlanSchema.safeParse(rawPlan);
    if (!parsed.success || !site) throw new RuntimeError(RUNTIME_PLAN_INVALID, '쿠팡 배송 목록 계획이 올바르지 않습니다.', { kind: COUPANG_SHIPMENT_LIST_KIND });
    const { date, maxPages } = parsed.data;
    const matched: CoupangShipmentListRow[] = [];
    let scannedPages = 0;
    let stopReason: CoupangShipmentListResult['stopReason'] = 'max_pages';
    try {
      const seen = new Set<string>();
      let emptyStreak = 0;
      for (let page = 1; page <= maxPages; page += 1) {
        if (signal.aborted) return;
        const rows = await site.parcelPage(page);
        scannedPages = page;
        if (rows.length === 0) {
          stopReason = 'empty_pages';
          break;
        }
        let hitThisPage = 0;
        for (const row of rows) {
          const outbound = row.outbound.slice(0, 10);
          if (outbound !== date || !ISO_DAY.test(outbound) || seen.has(row.seq)) continue;
          seen.add(row.seq);
          const boxes = /(\d+)/.exec(row.boxes);
          if (matched.length < COUPANG_SHIPMENT_LIST_ROWS_MAX) {
            matched.push({ seq: row.seq, center: row.center.slice(0, 200), outbound, boxes: boxes ? Number(boxes[1]) : 0, status: row.status?.slice(0, 100) ?? null });
          }
          hitThisPage += 1;
        }
        if (matched.length > 0) {
          emptyStreak = hitThisPage > 0 ? 0 : emptyStreak + 1;
          if (emptyStreak >= PAST_BLOCK_EMPTY_PAGES) {
            stopReason = 'past_date_block';
            break;
          }
        }
        if (rows.length < FULL_PAGE_ROWS) {
          stopReason = 'short_page';
          break;
        }
      }
    } finally {
      await site.close();
    }
    const progress = { current: scannedPages, total: maxPages, shipments: matched.length };
    const buffer = new ChunkBuffer<CoupangShipmentListRow>({ maxItems: CHUNK_ROWS, label: '쿠팡 쉽먼트 한 줄' });
    for (const row of matched) {
      const full = buffer.push(row);
      if (full) yield { chunkKind: COUPANG_SHIPMENT_LIST_CHUNK_KIND, payload: full, progress };
    }
    const rest = buffer.flush();
    if (rest) yield { chunkKind: COUPANG_SHIPMENT_LIST_CHUNK_KIND, payload: rest, progress };
    return { result: { scannedPages, stopReason } };
  },
};

registerCollector(coupangShipmentListCollector);
