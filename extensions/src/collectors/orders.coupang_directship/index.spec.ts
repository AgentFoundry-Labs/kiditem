import { afterEach, describe, expect, it, vi } from 'vitest';
import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import type { CollectedChunk } from '../collector';
import { coupangDirectshipCollector, detailItems, type DirectshipSite, type DirectshipTable } from './index';

// 기록한 supplier 응답(옛 worker.js scrapeCoupangPaList·scrapeCoupangDirectData가 읽던 목록·센터·상세).
const PLAN = { channelAccountId: '11111111-1111-4111-8111-111111111111', captureMode: 'browser' as const };
const listRow = (seq: number, overrides: Record<string, unknown> = {}) => ({
  purchaseOrderSeq: seq,
  purchaseOrderStatus: 'PA',
  centerName: 'Seoul FC',
  transportType: 'SHIPMENT',
  expectedDeliveryDate: '2026-07-31T15:00:00Z',
  createdAt: '2026-07-18T00:30:00Z',
  purchaseOrderType: 'NORMAL',
  ...overrides,
});
const cell = (text: string, header = false) => ({ text, rowSpan: 1, header });
const detailTable: DirectshipTable = {
  text: '순번 상품번호 바코드 상품명',
  rows: [
    { section: 'thead', cells: ['순번', '상품번호', '바코드 상품명'].map((text) => cell(text, true)) },
    { section: 'tbody', cells: ['1', 'P-1', '8801234567890 Rocket item', '매입', '2', '2', '1,000', '900', '100', '2,000'].map((text) => cell(text)) },
    { section: 'tbody', cells: ['합계', '', '', '', '2'].map((text) => cell(text)) },
  ],
};

function fakeSite(options: { pages: Array<{ rows: unknown[]; lastPageNumber: unknown } | Error>; details?: (seq: string) => DirectshipTable[] | Error; centers?: unknown }) {
  const calls: string[] = [];
  let closed = 0;
  const site: DirectshipSite = {
    async purchaseOrderListPage(query, page) {
      calls.push(`list ${page} ${query.status} ${query.from}~${query.to}`);
      const answer = options.pages[page - 1] ?? { rows: [], lastPageNumber: options.pages.length };
      if (answer instanceof Error) throw answer;
      return answer;
    },
    async purchasableCenters() {
      calls.push('centers');
      if (options.centers instanceof Error) throw options.centers;
      return options.centers ?? { body: [{ centerName: 'Seoul FC', address: 'Seoul', zipCode: '01234', contact: null }] };
    },
    async enterScmContext(seq) {
      calls.push(`scm ${seq}`);
    },
    async purchaseOrderDetail(seq) {
      calls.push(`detail ${seq}`);
      const answer = options.details ? options.details(seq) : [detailTable];
      if (answer instanceof Error) throw answer;
      return answer;
    },
    async close() {
      closed += 1;
    },
  };
  return { site, calls, closed: () => closed };
}

async function run(site: DirectshipSite) {
  const chunks: CollectedChunk[] = [];
  for await (const chunk of coupangDirectshipCollector.collect(PLAN, site, { signal: new AbortController().signal, tabId: 5, report: async () => undefined })) chunks.push(chunk);
  return chunks.flatMap((chunk) => chunk.payload);
}

afterEach(() => vi.useRealTimers());

describe('orders.coupang_directship 수집기(옛 worker.js 직배송 수집과 같은 규칙)', () => {
  it('발주확정 목록을 입고예정일 오늘~30일(KST)로 읽고, 센터표·첫 발주 /scm 진입 뒤 품목을 읽어 발주서 항목과 센터표를 올린다', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-20T16:00:00Z') }); // KST 7/21 01:00
    const fake = fakeSite({ pages: [{ rows: [listRow(101), listRow(102, { purchaseOrderStatus: 'RP' }), listRow(103, { transportType: 'MILKRUN', purchaseOrderType: 'URGENT' })], lastPageNumber: 1 }] });
    const items = await run(fake.site);
    expect(fake.calls).toEqual(['list 1 PA 2026-07-21~2026-08-20', 'centers', 'scm 101', 'detail 101', 'detail 103']);
    expect(items).toEqual([
      { purchaseOrder: { seq: '101', center: 'Seoul FC', transport: 'SHIPMENT', edd: '2026-08-01', reg: '2026-07-18', status: 'PA', urgent: false, items: [{ skuId: 'P-1', barcode: '8801234567890', name: 'Rocket item', qty: 2, amount: 2000 }] } },
      { purchaseOrder: expect.objectContaining({ seq: '103', transport: 'MILKRUN', urgent: true }) },
      { centers: { 'Seoul FC': { addr: 'Seoul', zip: '01234' } } },
    ]);
    expect(fake.closed()).toBe(1);
  });

  it('빈 목록은 센터표(빈)만 올리고 상세를 읽지 않는다', async () => {
    const fake = fakeSite({ pages: [{ rows: [], lastPageNumber: 1 }] });
    expect(await run(fake.site)).toEqual([{ centers: {} }]);
    expect(fake.calls).toEqual([expect.stringMatching(/^list 1 PA/)]);
  });

  it('첫 쪽 실패·로그인 필요는 실행을 실패시키고, 그 뒤 쪽의 요청 실패는 거기서 멈춘다; 목록은 40쪽까지', async () => {
    await expect(run(fakeSite({ pages: [new RuntimeError(SITE_LOGIN_REQUIRED, '로그인', {})] }).site)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    const stopped = fakeSite({ pages: [{ rows: [listRow(1)], lastPageNumber: 3 }, new RuntimeError(SITE_REQUEST_FAILED, '실패', {})] });
    expect((await run(stopped.site)).filter((item) => 'purchaseOrder' in (item as object))).toHaveLength(1);
    const many = fakeSite({ pages: Array.from({ length: 45 }, (_, index) => ({ rows: [listRow(index + 1)], lastPageNumber: 45 })) });
    await run(many.site);
    expect(many.calls.filter((call) => call.startsWith('list'))).toHaveLength(40);
  });

  it('상세를 못 읽은 발주서는 빈 품목으로 남기고(옛 규칙), 로그인 필요는 실패시킨다; 센터표 실패는 빈 표', async () => {
    const partial = fakeSite({ pages: [{ rows: [listRow(1), listRow(2)], lastPageNumber: 1 }], details: (seq) => (seq === '2' ? new Error('boom') : [detailTable]), centers: new Error('no centers') });
    const items = await run(partial.site);
    expect(items).toEqual([
      { purchaseOrder: expect.objectContaining({ seq: '1', items: [expect.objectContaining({ skuId: 'P-1' })] }) },
      { purchaseOrder: expect.objectContaining({ seq: '2', items: [] }) },
      { centers: {} },
    ]);
    const login = fakeSite({ pages: [{ rows: [listRow(1)], lastPageNumber: 1 }], details: () => new RuntimeError(SITE_LOGIN_REQUIRED, '로그인', {}) });
    await expect(run(login.site)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    expect(login.closed()).toBe(1);
  });

  it('품목 표는 "바코드" 표에서 셋째 칸이 12~14자리 바코드로 시작하는 행만 읽는다', () => {
    expect(detailItems([{ text: '회송지', rows: [] }, detailTable])).toEqual([{ skuId: 'P-1', barcode: '8801234567890', name: 'Rocket item', qty: 2, amount: 2000 }]);
    expect(detailItems([{ text: '바코드', rows: [{ section: 'tbody', cells: ['1', 'P', '1234 짧은 바코드'].map((text) => cell(text)) }] }])).toEqual([]);
  });
});
