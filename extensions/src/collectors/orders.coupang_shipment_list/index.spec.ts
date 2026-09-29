import { describe, expect, it } from 'vitest';
import { isRuntimeError, RuntimeError } from '../../core/errors';
import type { CollectedChunk, CollectFinish } from '../collector';
import { collectorFor } from '../index';
import { coupangShipmentListCollector, type ShipmentListParcelRow, type ShipmentListSite } from './index';

const DATE = '2026-09-10';
const row = (seq: string, outbound: string, overrides: Partial<ShipmentListParcelRow> = {}): ShipmentListParcelRow => ({
  seq, outbound: `${outbound} 10:00`, boxes: '2 박스', center: '동탄1', status: '발송 완료', ...overrides,
});
/** 한 쪽 10행(꽉 찬 쪽). */
const fullPage = (page: number, date: string) => Array.from({ length: 10 }, (_, index) => row(`${page}-${index}`, date));

function fakeSite(pages: Record<number, ShipmentListParcelRow[] | Error>) {
  const requested: number[] = [];
  let closed = 0;
  const site: ShipmentListSite = {
    async parcelPage(pageNumber) {
      requested.push(pageNumber);
      const page = pages[pageNumber] ?? [];
      if (page instanceof Error) throw page;
      return page;
    },
    async close() {
      closed += 1;
    },
  };
  return { site, requested, closed: () => closed };
}

async function run(site: ShipmentListSite, plan: Record<string, unknown> = { date: DATE, maxPages: 60 }) {
  const chunks: CollectedChunk[] = [];
  const stream = coupangShipmentListCollector.collect(plan as never, site, { signal: new AbortController().signal, tabId: null }) as AsyncGenerator<CollectedChunk, CollectFinish | void>;
  for (;;) {
    const step = await stream.next();
    if (step.done) return { chunks, finish: step.value ?? null, rows: chunks.flatMap((chunk) => chunk.payload) };
    chunks.push(step.value);
  }
}

describe('collectors/orders.coupang_shipment_list(옛 scrapeCoupangShipmentList 규칙)', () => {
  it('kind 이름으로 등록되고 coupang-supplier 사이트를 쓴다', () => {
    expect(collectorFor('orders.coupang_shipment_list')).toBe(coupangShipmentListCollector);
    expect(coupangShipmentListCollector.site).toBe('coupang-supplier');
  });

  it('필터 없이 쪽을 차례로 읽어 발송일이 같은 행만 seq 한 번씩 모으고, 대상 블록을 지난 뒤 2쪽 연속 0건이면 멈춘다', async () => {
    const { site, requested, closed } = fakeSite({
      1: fullPage(1, '2026-09-11'),
      2: [...fullPage(2, DATE).slice(0, 9), row('dup', DATE)],
      3: [row('dup', DATE, { center: '다른센터' }), ...fullPage(3, '2026-09-09').slice(1)],
      4: fullPage(4, '2026-09-08'),
      5: fullPage(5, DATE),
    });
    const { chunks, finish, rows } = await run(site);
    expect(requested).toEqual([1, 2, 3, 4]);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toEqual({ seq: '2-0', center: '동탄1', outbound: DATE, boxes: 2, status: '발송 완료' });
    expect(rows.at(-1)).toMatchObject({ seq: 'dup', center: '동탄1' });
    expect(chunks.every((chunk) => chunk.chunkKind === 'shipment_rows')).toBe(true);
    expect(finish).toEqual({ result: { scannedPages: 4, stopReason: 'past_date_block' } });
    expect(closed()).toBe(1);
  });

  it('빈 쪽에서 empty_pages, 10행보다 짧은 쪽에서 short_page, 상한까지 꽉 차면 max_pages로 멈춘다', async () => {
    const empty = await run(fakeSite({ 1: fullPage(1, DATE) }).site);
    expect(empty.finish).toEqual({ result: { scannedPages: 2, stopReason: 'empty_pages' } });

    const short = await run(fakeSite({ 1: [row('a', DATE), row('b', '2026-09-01')] }).site);
    expect(short.rows.map((item) => (item as { seq: string }).seq)).toEqual(['a']);
    expect(short.finish).toEqual({ result: { scannedPages: 1, stopReason: 'short_page' } });

    const capped = fakeSite({ 1: fullPage(1, DATE), 2: fullPage(2, DATE) });
    const max = await run(capped.site, { date: DATE, maxPages: 2 });
    expect(capped.requested).toEqual([1, 2]);
    expect(max.finish).toEqual({ result: { scannedPages: 2, stopReason: 'max_pages' } });
  });

  it('그날 쉽먼트가 없으면 청크 없이 성공한다(빈 목록도 결과다)', async () => {
    const { chunks, finish } = await run(fakeSite({ 1: [row('x', '2026-09-01')] }).site);
    expect(chunks).toEqual([]);
    expect(finish).toEqual({ result: { scannedPages: 1, stopReason: 'short_page' } });
  });

  it('박스 수는 숫자만, 발송일이 날짜가 아니면 행을 뺀다', async () => {
    const { rows } = await run(fakeSite({ 1: [row('a', DATE, { boxes: '박스 없음' }), row('b', DATE, { status: null, center: '' })] }).site);
    expect(rows).toEqual([
      { seq: 'a', center: '동탄1', outbound: DATE, boxes: 0, status: '발송 완료' },
      { seq: 'b', center: '', outbound: DATE, boxes: 2, status: null },
    ]);
  });

  it('쿠키 과다·로그인 같은 사이트 오류는 탭을 정리하고 그대로 올린다', async () => {
    const bloat = new RuntimeError('SITE_COOKIE_BLOAT', '쿠키가 큽니다.');
    const { site, closed } = fakeSite({ 1: bloat });
    await expect(run(site)).rejects.toBe(bloat);
    expect(closed()).toBe(1);
  });

  it('plan이 틀리면 읽지 않고 RUNTIME_PLAN_INVALID', async () => {
    const { site, requested } = fakeSite({});
    const error = await run(site, { date: '2026/09/10', maxPages: 60 }).then(() => null, (caught: unknown) => caught);
    expect(isRuntimeError(error) && error.code).toBe('RUNTIME_PLAN_INVALID');
    expect(requested).toEqual([]);
  });
});
