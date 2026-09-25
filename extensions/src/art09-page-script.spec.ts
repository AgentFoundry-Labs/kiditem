import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/art09-orders.js?raw';

// 아트공구 주문 페이지 스크립트(ISOLATED world 파일, 옛 worker.js `scrapeArt09Orders` 이식)를 실제 파일 그대로 돌린다.
// 가짜는 페이지 경계(보이는 주문목록 DOM·fetch·location)뿐이다 — 옛 수집기 테스트의 화면 그대로.
type Row = { cells: Array<{ innerText: string; textContent: string }>; innerText: string; querySelector(selector: string): unknown; getBoundingClientRect(): { width: number; height: number }; closest?: () => unknown };

const cells = (values: string[]) => values.map((value) => ({ innerText: value, textContent: value }));
function row(values: string[], checkbox?: { checked: boolean }): Row {
  return {
    cells: cells(values),
    innerText: values.filter(Boolean).join(' '),
    querySelector: (selector) => (checkbox && selector === 'input[type="checkbox"]' ? checkbox : null),
    getBoundingClientRect: () => ({ width: 500, height: 30 }),
  };
}

function load(rows: Row[], options: { pathname?: string; fetch?: (url: string) => Promise<unknown>; detailDoc?: unknown } = {}) {
  const table = { querySelectorAll: (selector: string) => (selector === 'tr' ? rows : []) };
  for (const tr of rows) tr.closest = () => table;
  const document = { body: { innerText: '주문목록 검색 결과' }, querySelector: () => null, querySelectorAll: (selector: string) => (selector === 'tr' ? rows : []) };
  const window = { getComputedStyle: () => ({ display: 'table-row', visibility: 'visible' }) };
  const location = { pathname: options.pathname ?? '/admin/php/shop1/s_new/order_list.php', search: '?1&shop_no=1' };
  class DetailParser {
    parseFromString() {
      return options.detailDoc ?? { body: { innerText: '상품 배송' }, querySelectorAll: () => [] };
    }
  }
  const isolated: Record<string, unknown> = {};
  new Function('document', 'window', 'location', 'fetch', 'DOMParser', 'globalThis', source)(
    document,
    window,
    location,
    options.fetch ?? (async () => { throw new Error('no detail fetch expected'); }),
    DetailParser,
    isolated,
  );
  return (isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Promise<Record<string, unknown>>>)['art09.orders']!;
}

describe('art09 orders page script', () => {
  it('배송준비전이 아닌 보이는 주문은 상세를 읽지 않고 0건 성공', async () => {
    const handler = load([
      row(['선택', '주문번호', '상품명', '처리상태']),
      row(['', '20260727-0000001', '이미 발송된 상품', '배송완료']),
    ]);
    await expect(handler({})).resolves.toEqual({ status: 'ok', rows: [], failures: [] });
  });

  it('요청한 날의 실제 주문 행만 골라 배송정보 상세를 읽고 Cafe24 CSV 행으로 만든다', async () => {
    const fetched: string[] = [];
    const handler = load([
      row(['선택', '주문번호', '주문일시', '상품명', '처리상태']),
      row(['', '20260727-0000001', '2026-07-27 09:00:00', '주문번호 입력 안내', '배송준비전']),
      row(['', '20260726-0000002', '2026-07-26 09:00:00', '어제 주문', '배송준비전'], { checked: false }),
      row(['', '20260727-0000003', '2026-07-27 10:00:00', '오늘 정상 상품', '배송준비전'], { checked: false }),
    ], {
      fetch: async (url) => {
        fetched.push(new URL(url, 'https://zzogzzog1.cafe24.com').searchParams.get('order_id') ?? '');
        return {
          ok: true,
          headers: { get: () => 'text/html;charset=utf-8' },
          arrayBuffer: async () => new TextEncoder().encode('<html><body>상품 배송</body></html>').buffer,
        };
      },
    });
    const answer = await handler({ dateFilter: '2026-07-27' });
    expect(fetched).toEqual(['20260727-0000003']);
    expect(answer).toMatchObject({ status: 'ok', failures: [] });
    expect(answer.rows).toEqual([expect.objectContaining({
      shopName: '한국어 쇼핑몰',
      orderId: '20260727-0000003',
      productName: '오늘 정상 상품',
      qty: '1',
      orderedAt: '2026-07-27 10:00:00',
    })]);
  });

  it('주문목록 밖으로 튕긴 빈 화면은 login_required, 상세가 모두 실패하면 failed', async () => {
    await expect(load([], { pathname: '/admin/login.php' })({})).resolves.toEqual({ status: 'login_required' });
    const handler = load([
      row(['선택', '주문번호', '상품명', '처리상태']),
      row(['', '20260727-0000003', '오늘 정상 상품', '배송준비전'], { checked: false }),
    ], { fetch: async () => ({ ok: false, status: 500 }) });
    await expect(handler({})).resolves.toEqual({ status: 'failed', error: '아트공구 주문 상세 수집 실패: 20260727-0000003: 상세 HTTP 500' });
  });
});
