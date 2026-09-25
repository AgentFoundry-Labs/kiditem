import {
  COUPANG_SHIPMENT_SUMMARY_CHUNK_KIND,
  COUPANG_SHIPMENT_SUMMARY_KIND,
  COUPANG_SHIPMENT_SUMMARY_PAGE_ROWS,
  COUPANG_SHIPMENT_SUMMARY_SCAN_CHUNK_KIND,
  type CoupangShipmentDateItem,
  type CoupangShipmentScan,
  type CoupangShipmentSummaryProgress,
} from '@kiditem/shared/orders-operations';
import { z } from 'zod';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { CollectedChunk, Collector } from '../collector';
import { registerCollector } from '../index';

/** 쉽먼트 목록 한 행(`sites/coupang-supplier`가 읽는다). */
export interface SupplierParcelRow {
  seq: string;
  outbound: string;
  boxes: string;
}

/** 이 수집기가 supplier에서 쓰는 것(`sites/coupang-supplier`가 구현, 입구가 넘긴다). */
export interface SupplierParcelSite {
  parcelPage(pageNumber: number): Promise<SupplierParcelRow[]>;
  close(): Promise<void>;
}

const PlanSchema = z.object({ maxPages: z.number().int().min(1).max(60) });
export type CoupangShipmentSummaryPlan = z.infer<typeof PlanSchema>;

/** 옛 수집과 같다: 6쪽씩 함께 읽는다. */
const PAGE_FETCH_CONCURRENCY = 6;
const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;

/**
 * `orders.coupang_shipment_summary`(KID-359): supplier 쉽먼트 목록을 plan의 쪽 상한까지 6쪽씩 읽는다. 빈 쪽이나
 * 10행보다 짧은 쪽에서 멈추고, 쉽먼트 번호는 처음 본 것만 세어 발송일별 {count, boxes}로 모은다(옛
 * `scrapeCoupangShipmentDateSummary`). 끝나면 발송일 항목 `shipment_dates`와 읽은 쪽 증거 `shipment_scan` 하나를
 * 올린다 — 완결 판정은 서버 finalize가 한다. progress `{current, total, done}` = 읽은 쪽 / 쪽 상한.
 */
export const coupangShipmentSummaryCollector: Collector<CoupangShipmentSummaryPlan, Record<string, unknown>, SupplierParcelSite> = {
  kind: COUPANG_SHIPMENT_SUMMARY_KIND,
  site: 'coupang-supplier',
  async *collect(rawPlan, site, { signal, report }) {
    const parsed = PlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw new RuntimeError(RUNTIME_PLAN_INVALID, '쉽먼트 조회 계획이 올바르지 않습니다.', { kind: COUPANG_SHIPMENT_SUMMARY_KIND });
    if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, '서플라이어 허브 사이트를 쓸 수 없습니다.', { kind: COUPANG_SHIPMENT_SUMMARY_KIND });
    const { maxPages } = parsed.data;
    try {
      const seen = new Set<string>();
      const byDate = new Map<string, { count: number; boxes: number }>();
      const pageRowCounts: number[] = [];
      let totalRows = 0;
      let stopReason: CoupangShipmentScan['stopReason'] = 'max_pages';
      let reachedLastPage = false;
      for (let batchStart = 1; batchStart <= maxPages && !reachedLastPage; batchStart += PAGE_FETCH_CONCURRENCY) {
        if (signal.aborted) return;
        const batchEnd = Math.min(batchStart + PAGE_FETCH_CONCURRENCY - 1, maxPages);
        const pages = Array.from({ length: batchEnd - batchStart + 1 }, (_, index) => batchStart + index);
        const batch = await Promise.all(pages.map(async (page) => site.parcelPage(page)));
        for (const rows of batch) {
          pageRowCounts.push(rows.length);
          if (rows.length === 0) {
            stopReason = 'empty_page';
            reachedLastPage = true;
            break;
          }
          for (const row of rows) {
            if (seen.has(row.seq)) continue;
            seen.add(row.seq);
            totalRows += 1;
            const date = row.outbound.slice(0, 10);
            const boxes = /(\d+)/.exec(row.boxes);
            const current = byDate.get(date) ?? { count: 0, boxes: 0 };
            current.count += 1;
            current.boxes += boxes ? Number(boxes[1]) : 0;
            byDate.set(date, current);
          }
          if (rows.length < COUPANG_SHIPMENT_SUMMARY_PAGE_ROWS) {
            stopReason = 'short_page';
            reachedLastPage = true;
            break;
          }
        }
        await report?.(progress(pageRowCounts.length, maxPages, false));
      }
      if (signal.aborted) return;
      const buffer = new ChunkBuffer<CoupangShipmentDateItem>({ maxItems: 1_000, label: '발송일 항목' });
      const dates = [...byDate.entries()]
        .map(([date, value]) => ({ date, count: value.count, boxes: value.boxes }))
        .sort((a, b) => b.date.localeCompare(a.date));
      for (const item of dates) {
        const full = buffer.push(item);
        if (full) yield datesChunk(full, progress(pageRowCounts.length, maxPages, false));
      }
      const rest = buffer.flush();
      if (rest) yield datesChunk(rest, progress(pageRowCounts.length, maxPages, false));
      const scan: CoupangShipmentScan = {
        maxPages,
        scannedPages: pageRowCounts.length,
        totalRows,
        stopReason,
        lastPageRowCount: pageRowCounts.at(-1) ?? 0,
        pageRowCounts,
        validatedTable: true,
      };
      yield { chunkKind: COUPANG_SHIPMENT_SUMMARY_SCAN_CHUNK_KIND, payload: [scan], progress: progress(pageRowCounts.length, maxPages, true) };
    } finally {
      await site.close();
    }
  },
};

function progress(current: number, total: number, done: boolean): CoupangShipmentSummaryProgress {
  return { current, total, done };
}

function datesChunk(payload: CoupangShipmentDateItem[], value: CoupangShipmentSummaryProgress): CollectedChunk {
  return { chunkKind: COUPANG_SHIPMENT_SUMMARY_CHUNK_KIND, payload, progress: value };
}

registerCollector(coupangShipmentSummaryCollector);
