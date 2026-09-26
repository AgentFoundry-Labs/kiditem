import { describe, expect, it } from 'vitest';
import type { CollectedChunk } from '../collector';
import { collectorFor } from '../index';
import { RuntimeError } from '../../core/errors';
import { wingTrafficCollector, type WingTrafficSite } from './index';

const ACCOUNT = '5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11';
const SUMMARY = { visitors: 1, views: 2, cartAdds: 0, orders: 0, salesQty: 0, revenue: 0, providerConversionRate: null };
function plan(dates: string[]) {
  return { channelAccountId: ACCOUNT, vendorId: 'A0001', startDate: dates[0], endDate: dates.at(-1), expectedDates: dates, maxPagesPerDay: 3, startedAt: '2026-09-26T00:00:00.000Z' };
}
function option(vendorItemId: string) {
  return { vendorItemId, productId: '77', visitors: 1, views: 2, cartAdds: 0, orders: 0, salesQty: 0, revenue: 0 };
}

/** 가짜 Wing: 날짜 → 옵션 수. 쪽은 100개씩. */
function fakeWing(countByDate: Record<string, number>, freshness = { salesLatest: '2026-09-03', trafficLatest: '2026-09-03', viewableStart: '2025-01-01', viewableEnd: '2026-09-03' }, vendorId = 'A0001') {
  const pages: Array<{ businessDate: string; pageNumber: number }> = [];
  const summaries: Array<{ startDate: string; endDate: string }> = [];
  const site: WingTrafficSite = {
    readVendorId: async () => vendorId,
    readFreshness: async () => freshness,
    async readDetailPage({ businessDate, pageNumber }) {
      pages.push({ businessDate, pageNumber });
      const total = countByDate[businessDate] ?? 0;
      const rows = Array.from({ length: Math.max(0, Math.min(100, total - pageNumber * 100)) }, (_, index) => option(String(pageNumber * 100 + index + 1)));
      return { rows, totalResults: total, totalPages: Math.ceil(total / 100), pageSize: 100, pageNumber };
    },
    async readSummary(range) {
      summaries.push(range);
      return SUMMARY;
    },
  };
  return { site, pages, summaries };
}

async function collectAll(rawPlan: unknown, site: WingTrafficSite | null, signal = new AbortController().signal) {
  const chunks: CollectedChunk[] = [];
  const reports: Array<Record<string, unknown>> = [];
  for await (const chunk of wingTrafficCollector.collect(rawPlan as never, site as never, { signal, tabId: null, report: async (progress) => { reports.push(progress); } })) chunks.push(chunk);
  return { chunks, reports };
}

describe('collectors/advertising.wing_traffic — Wing 일별 트래픽', () => {
  it('kind 이름으로 등록되고 wing-traffic 사이트를 쓴다', () => {
    expect(collectorFor('advertising.wing_traffic')).toBe(wingTrafficCollector);
    expect(wingTrafficCollector.site).toBe('wing-traffic');
  });

  it('날마다 쪽을 다 읽어 옵션-일 행과 날 표식을 내고, 끝에 확정 창 기간 요약을 낸다', async () => {
    const wing = fakeWing({ '2026-09-01': 150, '2026-09-02': 0 });
    const { chunks, reports } = await collectAll(plan(['2026-09-01', '2026-09-02']), wing.site);
    expect(wing.pages).toEqual([
      { businessDate: '2026-09-01', pageNumber: 0 },
      { businessDate: '2026-09-01', pageNumber: 1 },
      { businessDate: '2026-09-02', pageNumber: 0 },
    ]);
    const rows = chunks.filter((chunk) => chunk.chunkKind === 'traffic_rows').flatMap((chunk) => chunk.payload) as Array<{ businessDate: string }>;
    expect(rows).toHaveLength(150);
    expect(rows.every((row) => row.businessDate === '2026-09-01')).toBe(true);
    const days = chunks.filter((chunk) => chunk.chunkKind === 'traffic_days').flatMap((chunk) => chunk.payload);
    expect(days).toMatchObject([
      { businessDate: '2026-09-01', pages: 2, rows: 150, explicitEmpty: false, accountSummary: SUMMARY },
      { businessDate: '2026-09-02', pages: 1, rows: 0, explicitEmpty: true },
    ]);
    expect(chunks.at(-1)).toMatchObject({ chunkKind: 'traffic_period', payload: [{ startDate: '2026-09-01', endDate: '2026-09-02', vendorId: 'A0001' }] });
    expect(wing.summaries).toEqual([
      { startDate: '2026-09-01', endDate: '2026-09-01' },
      { startDate: '2026-09-02', endDate: '2026-09-02' },
      { startDate: '2026-09-01', endDate: '2026-09-02' },
    ]);
    // 쪽 사이마다 progress를 올려 임대를 연장한다.
    expect(reports.length).toBeGreaterThanOrEqual(3);
  });

  it('쿠팡이 아직 공개하지 않은 뒷날은 읽지 않고 확정 창에서 뺀다, 앞날도 없으면 멈춘다', async () => {
    const freshness = { salesLatest: '2026-09-02', trafficLatest: '2026-09-01', viewableStart: '2025-01-01', viewableEnd: '2026-09-03' };
    const wing = fakeWing({ '2026-09-01': 1 }, freshness);
    const { chunks } = await collectAll(plan(['2026-09-01', '2026-09-02']), wing.site);
    expect(wing.pages.map((page) => page.businessDate)).toEqual(['2026-09-01']);
    expect(chunks.at(-1)!.payload[0]).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-01' });

    const late = fakeWing({}, { ...freshness, trafficLatest: '2026-08-31' });
    await expect(collectAll(plan(['2026-09-01']), late.site)).rejects.toMatchObject({ code: 'WING_TRAFFIC_DATA_NOT_READY' });
  });

  it('쪽 수가 계획 상한을 넘거나 쪽 사이 메타데이터가 바뀌면 잘린 날을 완결로 보지 않는다', async () => {
    const tooMany = fakeWing({ '2026-09-01': 350 });
    await expect(collectAll(plan(['2026-09-01']), tooMany.site)).rejects.toMatchObject({ code: 'RUNTIME_PAGE_LIMIT_REACHED' });
    const shifting = fakeWing({ '2026-09-01': 150 });
    const original = shifting.site.readDetailPage;
    shifting.site.readDetailPage = async (input) => ({ ...(await original(input)), totalResults: input.pageNumber === 0 ? 150 : 160 });
    await expect(collectAll(plan(['2026-09-01']), shifting.site)).rejects.toBeInstanceOf(RuntimeError);
  });

  it('로그인한 Wing 세션의 업체코드가 plan 계정과 다르면 매출분석을 읽지 않고 멈춘다(빈 날만 있는 창도)', async () => {
    const other = fakeWing({ '2026-09-01': 0 }, undefined, 'B0002');
    await expect(collectAll(plan(['2026-09-01']), other.site)).rejects.toMatchObject({ code: 'WING_VENDOR_IDENTITY_MISMATCH' });
    expect(other.pages).toEqual([]);
    expect(other.summaries).toEqual([]);
  });

  it('plan이 틀리면 멈추고, 중단되면 더 읽지 않는다', async () => {
    await expect(collectAll({}, fakeWing({}).site)).rejects.toBeInstanceOf(RuntimeError);
    const aborted = new AbortController();
    aborted.abort();
    expect((await collectAll(plan(['2026-09-01']), fakeWing({ '2026-09-01': 1 }).site, aborted.signal)).chunks).toEqual([]);
  });
});
