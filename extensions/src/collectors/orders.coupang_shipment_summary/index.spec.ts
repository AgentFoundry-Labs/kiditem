import { describe, expect, it } from 'vitest';
import type { CoupangShipmentScan } from '@kiditem/shared/orders-operations';
import type { CollectedChunk } from '../collector';
import { coupangShipmentSummaryCollector, type SupplierParcelSite, type SupplierParcelRow } from './index';

const row = (seq: string, outbound: string, boxes: string): SupplierParcelRow => ({ seq, outbound, boxes });

function fakeSite(pages: Record<number, SupplierParcelRow[]>) {
  const requested: number[] = [];
  let closed = 0;
  const site: SupplierParcelSite = {
    async parcelPage(pageNumber) {
      requested.push(pageNumber);
      return pages[pageNumber] ?? [];
    },
    async close() {
      closed += 1;
    },
  };
  return { site, requested, closed: () => closed };
}

async function run(plan: Record<string, unknown>, site: SupplierParcelSite) {
  const chunks: CollectedChunk[] = [];
  const reports: Record<string, unknown>[] = [];
  for await (const chunk of coupangShipmentSummaryCollector.collect(plan as never, site, {
    signal: new AbortController().signal,
    tabId: null,
    report: async (progress) => {
      reports.push(progress);
    },
  })) chunks.push(chunk);
  return { chunks, reports };
}

describe('orders.coupang_shipment_summary 수집기(옛 scrapeCoupangShipmentDateSummary와 같은 규칙)', () => {
  it('6쪽씩 함께 읽고, 짧은 쪽에서 멈추며, 쉽먼트 번호는 처음 본 것만 세어 발송일별로 모은다', async () => {
    const tenOn = (date: string) => Array.from({ length: 10 }, (_, index) => row(String(index), `${date} 10:00`, '2 boxes'));
    const { site, requested, closed } = fakeSite({
      1: tenOn('2026-09-01'),
      2: [row('0', '2026-09-02', '99'), row('new', '2026-09-02', 'none')],
    });
    const { chunks, reports } = await run({ maxPages: 40 }, site);
    expect(requested).toEqual([1, 2, 3, 4, 5, 6]);
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['shipment_dates', 'shipment_scan']);
    expect(chunks[0]!.payload).toEqual([
      { date: '2026-09-02', count: 1, boxes: 0 },
      { date: '2026-09-01', count: 10, boxes: 20 },
    ]);
    const scan: CoupangShipmentScan = {
      maxPages: 40,
      scannedPages: 2,
      totalRows: 11,
      stopReason: 'short_page',
      lastPageRowCount: 2,
      pageRowCounts: [10, 2],
      validatedTable: true,
    };
    expect(chunks[1]!.payload).toEqual([scan]);
    expect(chunks[1]!.progress).toEqual({ current: 2, total: 40, done: true });
    expect(reports).toEqual([{ current: 2, total: 40, done: false }]);
    expect(closed()).toBe(1);
  });

  it('빈 첫 쪽은 발송일 청크 없이 empty_page 증거만 올린다', async () => {
    const { chunks } = await run({ maxPages: 40 }, fakeSite({}).site);
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['shipment_scan']);
    expect(chunks[0]!.payload).toEqual([
      { maxPages: 40, scannedPages: 1, totalRows: 0, stopReason: 'empty_page', lastPageRowCount: 0, pageRowCounts: [0], validatedTable: true },
    ]);
  });

  it('쪽 상한까지 꽉 찬 쪽이면 max_pages로 멈춘다', async () => {
    const full = (page: number) => Array.from({ length: 10 }, (_, index) => row(`${page}-${index}`, '2026-09-03 09:00', '1 박스'));
    const { site, requested } = fakeSite({ 1: full(1), 2: full(2) });
    const { chunks } = await run({ maxPages: 2 }, site);
    expect(requested).toEqual([1, 2]);
    expect(chunks.at(-1)!.payload[0]).toMatchObject({ scannedPages: 2, totalRows: 20, stopReason: 'max_pages', pageRowCounts: [10, 10] });
  });

  it('사이트가 실패해도 탭을 정리하고 오류를 그대로 올린다', async () => {
    const { site, closed } = fakeSite({});
    site.parcelPage = async () => {
      throw new Error('boom');
    };
    await expect(run({ maxPages: 40 }, site)).rejects.toThrow('boom');
    expect(closed()).toBe(1);
  });
});
