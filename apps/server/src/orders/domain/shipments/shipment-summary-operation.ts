import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  COUPANG_SHIPMENT_SUMMARY_CHUNK_KIND,
  COUPANG_SHIPMENT_SUMMARY_PAGE_ROWS,
  COUPANG_SHIPMENT_SUMMARY_SCAN_CHUNK_KIND,
  CoupangShipmentDateItemSchema,
  CoupangShipmentScanSchema,
  type CoupangShipmentDateItem,
  type CoupangShipmentScan,
} from '@kiditem/shared/orders-operations';
import type { z } from 'zod';

/** 한 실행이 저장하는 발송일 상한(옛 attempt와 같다). */
const MAX_DATES = 1_000;

/**
 * 실행 청크를 발송일 항목과 읽은 쪽 증거로 읽는다. 이 kind의 청크는 `shipment_dates`·`shipment_scan` 둘뿐이고
 * 증거는 정확히 하나다. 아니면 VALIDATION_FAILED(`unknown_chunk_kind`·`invalid_chunk_item`·`shipment_summary_evidence_invalid`).
 */
export function readShipmentSummaryChunks(chunks: readonly OperationStagedChunk[]): {
  dates: CoupangShipmentDateItem[];
  scan: CoupangShipmentScan;
} {
  const unknown = chunks.find((chunk) => chunk.chunkKind !== COUPANG_SHIPMENT_SUMMARY_CHUNK_KIND && chunk.chunkKind !== COUPANG_SHIPMENT_SUMMARY_SCAN_CHUNK_KIND);
  if (unknown) throw invalid('unknown_chunk_kind', { chunkKind: unknown.chunkKind });
  const scans = chunkItems(chunks, COUPANG_SHIPMENT_SUMMARY_SCAN_CHUNK_KIND, CoupangShipmentScanSchema);
  if (scans.length !== 1) throw evidenceInvalid();
  return { dates: chunkItems(chunks, COUPANG_SHIPMENT_SUMMARY_CHUNK_KIND, CoupangShipmentDateItemSchema), scan: scans[0]! };
}

/**
 * 옛 attempt 제출 검증을 그대로 옮긴 완결 판정. 쪽마다 행 수가 있고, 마지막 쪽 전까지는 꽉 찬 쪽(10행)이며,
 * 멈춘 까닭이 마지막 쪽과 맞고(빈 쪽·짧은 쪽·plan 상한), 발송일 항목의 합이 센 행 수와 같아야 한다. 빈 결과는
 * 첫 쪽이 빈 쪽일 때만이다. 통과하면 발송일을 한 번씩(마지막 값) 날짜 내림차순으로 돌려준다.
 */
export function completeShipmentSummary(input: {
  maxPages: number;
  dates: readonly CoupangShipmentDateItem[];
  scan: CoupangShipmentScan;
}): CoupangShipmentDateItem[] {
  const { scan, maxPages } = input;
  const counts = scan.pageRowCounts;
  if (
    input.dates.length > MAX_DATES ||
    scan.maxPages !== maxPages ||
    scan.scannedPages > maxPages ||
    counts.length !== scan.scannedPages ||
    counts.some((count, index) => index < scan.scannedPages - 1 && count < COUPANG_SHIPMENT_SUMMARY_PAGE_ROWS) ||
    counts.at(-1) !== scan.lastPageRowCount ||
    counts.reduce((sum, count) => sum + count, 0) < scan.totalRows
  ) {
    throw evidenceInvalid();
  }
  const stopped =
    (scan.stopReason === 'empty_page' && scan.lastPageRowCount === 0) ||
    (scan.stopReason === 'short_page' && scan.lastPageRowCount > 0 && scan.lastPageRowCount < COUPANG_SHIPMENT_SUMMARY_PAGE_ROWS) ||
    (scan.stopReason === 'max_pages' && scan.scannedPages === maxPages && scan.lastPageRowCount >= COUPANG_SHIPMENT_SUMMARY_PAGE_ROWS);
  if (!stopped) throw evidenceInvalid();
  const byDate = new Map<string, CoupangShipmentDateItem>();
  for (const item of input.dates) byDate.set(item.date, { date: item.date, count: item.count, boxes: item.boxes });
  const items = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  if (
    items.reduce((sum, item) => sum + item.count, 0) !== scan.totalRows ||
    (items.length === 0 && (scan.scannedPages !== 1 || scan.stopReason !== 'empty_page'))
  ) {
    throw evidenceInvalid();
  }
  return items;
}

function chunkItems<S extends z.ZodTypeAny>(chunks: readonly OperationStagedChunk[], chunkKind: string, schema: S): Array<z.output<S>> {
  const items: Array<z.output<S>> = [];
  for (const chunk of chunks) {
    if (chunk.chunkKind !== chunkKind) continue;
    for (const raw of chunk.payload) {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw invalid('invalid_chunk_item', {
          chunkKind,
          errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
        });
      }
      items.push(parsed.data);
    }
  }
  return items;
}

function evidenceInvalid(): KiditemInvalidValueError {
  return invalid('shipment_summary_evidence_invalid', {});
}

function invalid(reason: string, details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}
