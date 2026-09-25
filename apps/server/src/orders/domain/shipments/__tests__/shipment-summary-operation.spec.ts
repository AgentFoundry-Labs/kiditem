import { describe, expect, it } from 'vitest';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import type { CoupangShipmentScan } from '@kiditem/shared/orders-operations';
import { completeShipmentSummary, readShipmentSummaryChunks } from '../shipment-summary-operation';

function scan(overrides: Partial<CoupangShipmentScan> = {}): CoupangShipmentScan {
  return {
    maxPages: 40,
    scannedPages: 1,
    totalRows: 3,
    stopReason: 'short_page',
    lastPageRowCount: 3,
    pageRowCounts: [3],
    validatedTable: true,
    ...overrides,
  };
}

function chunk(chunkKind: string, sequence: number, payload: unknown[]): OperationStagedChunk {
  return { chunkKind, sequence, payload, checksum: 'x', itemCount: payload.length } as OperationStagedChunk;
}

const reason = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string; details?: { reason?: string } });
  }
  throw new Error('expected a refusal');
};

describe('배송요약 finalize 규칙(옛 attempt 제출 검증과 같다)', () => {
  it('발송일 항목을 날짜 내림차순으로, 같은 날짜는 마지막 값으로 돌려준다', () => {
    const items = completeShipmentSummary({
      maxPages: 40,
      dates: [
        { date: '2026-07-24', count: 1, boxes: 1 },
        { date: '2026-07-27', count: 9, boxes: 9 },
        { date: '2026-07-27', count: 2, boxes: 4 },
      ],
      scan: scan(),
    });
    expect(items).toEqual([
      { date: '2026-07-27', count: 2, boxes: 4 },
      { date: '2026-07-24', count: 1, boxes: 1 },
    ]);
  });

  it('빈 결과는 첫 쪽이 빈 쪽(empty_page)일 때만 받는다', () => {
    expect(completeShipmentSummary({
      maxPages: 40,
      dates: [],
      scan: scan({ totalRows: 0, stopReason: 'empty_page', lastPageRowCount: 0, pageRowCounts: [0] }),
    })).toEqual([]);
    expect(reason(() => completeShipmentSummary({
      maxPages: 40,
      dates: [],
      scan: scan({ scannedPages: 2, totalRows: 10, stopReason: 'empty_page', lastPageRowCount: 0, pageRowCounts: [10, 0] }),
    }))).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'shipment_summary_evidence_invalid' } });
  });

  it('쪽 상한에서 멈춘 수집은 plan의 상한까지 꽉 찬 쪽만 받는다', () => {
    const full = Array.from({ length: 2 }, () => 10);
    expect(completeShipmentSummary({
      maxPages: 2,
      dates: [{ date: '2026-07-27', count: 20, boxes: 20 }],
      scan: scan({ maxPages: 2, scannedPages: 2, totalRows: 20, stopReason: 'max_pages', lastPageRowCount: 10, pageRowCounts: full }),
    })).toHaveLength(1);
    expect(reason(() => completeShipmentSummary({
      maxPages: 3,
      dates: [{ date: '2026-07-27', count: 20, boxes: 20 }],
      scan: scan({ maxPages: 2, scannedPages: 2, totalRows: 20, stopReason: 'max_pages', lastPageRowCount: 10, pageRowCounts: full }),
    }))).toMatchObject({ details: { reason: 'shipment_summary_evidence_invalid' } });
  });

  it('쪽별 행 수가 빠지거나 중간 쪽이 짧거나 합계가 발송일 항목과 다르면 거절한다', () => {
    const date = { date: '2026-07-27', count: 13, boxes: 13 };
    const refused = [
      scan({ scannedPages: 2, totalRows: 13, lastPageRowCount: 3, pageRowCounts: [3] }),
      scan({ scannedPages: 2, totalRows: 13, lastPageRowCount: 3, pageRowCounts: [9, 3] }),
      scan({ scannedPages: 2, totalRows: 14, lastPageRowCount: 3, pageRowCounts: [10, 3] }),
      scan({ scannedPages: 2, totalRows: 13, stopReason: 'short_page', lastPageRowCount: 10, pageRowCounts: [3, 10] }),
    ];
    for (const evidence of refused) {
      expect(reason(() => completeShipmentSummary({ maxPages: 40, dates: [date], scan: evidence })))
        .toMatchObject({ details: { reason: 'shipment_summary_evidence_invalid' } });
    }
    expect(completeShipmentSummary({
      maxPages: 40,
      dates: [date],
      scan: scan({ scannedPages: 2, totalRows: 13, lastPageRowCount: 3, pageRowCounts: [10, 3] }),
    })).toEqual([date]);
  });

  it('청크는 shipment_dates·shipment_scan 둘뿐이고 scan은 정확히 하나여야 한다', () => {
    const date = { date: '2026-07-27', count: 3, boxes: 3 };
    expect(readShipmentSummaryChunks([
      chunk('shipment_dates', 1, [date]),
      chunk('shipment_scan', 1, [scan()]),
    ])).toEqual({ dates: [date], scan: scan() });
    expect(reason(() => readShipmentSummaryChunks([chunk('po_rows', 1, [date])])))
      .toMatchObject({ details: { reason: 'unknown_chunk_kind' } });
    expect(reason(() => readShipmentSummaryChunks([chunk('shipment_dates', 1, [date])])))
      .toMatchObject({ details: { reason: 'shipment_summary_evidence_invalid' } });
    expect(reason(() => readShipmentSummaryChunks([chunk('shipment_dates', 1, [{ date: '2026-7-1', count: 1, boxes: 0 }]), chunk('shipment_scan', 1, [scan()])])))
      .toMatchObject({ details: { reason: 'invalid_chunk_item' } });
  });
});
