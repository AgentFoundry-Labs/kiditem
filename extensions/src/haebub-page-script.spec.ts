// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/page-call/haebub-mall-orders.js?raw';

// 해법몰 주문 페이지 스크립트(ISOLATED world 파일, 옛 worker.js `scrapeHaebeopOrders` 이식)를 실제 파일 그대로 돌린다.
// DOM 파서는 jsdom, 가짜는 페이지 경계(fetch·location·지금 화면)뿐이다 — 옛 수집기 테스트(목록 쪽 넘김·상세 실패·빈 날·
// 쪽 상한)의 화면을 HTML로 옮겼다.
const PAGE_URL = 'https://mallseller.genimarket.co.kr/mall/order/basket_list.php';

function listHtml(orders: Array<{ orderId: string; date?: string }>, pages: number[] = []) {
  const rows = orders.map(({ orderId, date }) => `<tr>
    <td><input type="checkbox" name="select_checkbox" value="${orderId}"></td><td>${date ?? '2026-07-31 19:54:20'}</td>
    <td>${orderId}</td><td>주문자 ${orderId}</td><td>일반</td><td>목록 상품</td><td>신 + 포</td><td>은행</td><td>기능</td></tr>`).join('');
  const links = pages.map((page) => `<a href="basket_list.php?page=${page}">${page}</a>`).join(' ');
  return `<html><body><table>${rows}</table><div>${links}</div></body></html>`;
}

function detailHtml(orderId: string, items: Array<{ status: string }> = [{ status: '결제완료' }]) {
  const rows = items.map((item, index) => `<tr>
    <td><input type="checkbox" name="select_basket_no" value="B-${orderId}-${index}"></td><td>공급사</td><td></td>
    <td>상품 ${orderId}-${index}</td><td>2</td><td>5,000</td><td>10,000</td><td>-</td><td>${item.status}</td></tr>`).join('');
  return `<html><body><form>
    <input name="total_price" value="12,000"><input name="prdcode" value="PRD-1">
    <input name="send_id" value="member"><input name="send_name" value="주문자"><input name="send_email" value="a@b.c">
    <input name="send_tphone" value="02-111"><input name="send_hphone" value="010-111"><input name="send_post" value="06000">
    <input name="send_address" value="서울 강남구"><input name="rece_name" value="수취인"><input name="rece_email" value="">
    <input name="rece_tphone" value="02-222"><input name="rece_hphone" value="010-222"><input name="rece_post" value="07000">
    <input name="rece_address" value="서울 마포구"><input name="demand" value="문 앞"><input name="descript" value="">
  </form>
  <table>${rows}<tr><td>결제방법</td><td>카드</td></tr></table></body></html>`;
}

type Answer = { status: string; orders?: Array<Record<string, unknown>>; error?: string };

function load(options: {
  lists: Record<string, string>;
  details?: Record<string, { ok?: boolean; status?: number; html?: string }>;
  pageUrl?: string;
  listUrl?: string;
  pageHasPassword?: boolean;
}) {
  const requests: Array<{ url: string; body?: URLSearchParams }> = [];
  const isolated: Record<string, unknown> = {};
  const encoder = new TextEncoder();
  const fetch = async (url: string, init?: RequestInit) => {
    const body = init?.body ? new URLSearchParams(String(init.body)) : undefined;
    requests.push({ url, ...(body ? { body } : {}) });
    if (url === '/mall/order/basket_list.php') {
      const html = options.lists[body?.get('page') ?? '1'] ?? listHtml([]);
      return { ok: true, status: 200, url: options.listUrl ?? `https://mallseller.genimarket.co.kr${url}`, arrayBuffer: async () => encoder.encode(html).buffer };
    }
    const orderId = new URL(url, PAGE_URL).searchParams.get('orderid') ?? '';
    const detail = options.details?.[orderId] ?? { html: detailHtml(orderId) };
    return { ok: detail.ok ?? true, status: detail.status ?? 200, url, arrayBuffer: async () => encoder.encode(detail.html ?? '').buffer };
  };
  const document = { querySelector: (selector: string) => (options.pageHasPassword && selector === 'input[type="password"]' ? {} : null) };
  new Function('globalThis', 'fetch', 'location', 'document', source)(isolated, fetch, { href: options.pageUrl ?? PAGE_URL }, document);
  const handler = (isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Promise<Answer>>)['haebub-mall.orders']!;
  return { handler, requests };
}

describe('haebub-mall orders page script', () => {
  it('결제완료 목록을 보이는 쪽까지 모두 읽은 뒤 주문마다 상세를 한 번씩 펼쳐 상품행을 옛 변환 본문 원소로 만든다(읽기만)', async () => {
    const { handler, requests } = load({
      lists: { 1: listHtml([{ orderId: '1001' }, { orderId: '1001' }], [1, 2]), 2: listHtml([{ orderId: '1002' }], [1, 2]) },
      details: { 1002: { html: detailHtml('1002', [{ status: '결제완료' }, { status: '배송중' }]) } },
    });
    const answer = await handler({ date: '2026-07-31', vendor: '거영아이앤디' });
    expect(answer.status).toBe('ok');
    expect(answer.orders!.map((order) => [order.orderNo, order.regNo, order.shipFee])).toEqual([
      ['1001', 'B-1001-0', 2000],
      // 배송비 = 총결제 − 상품 합계(두 상품 20,000 > 12,000이면 0). 배송중 상품행은 펼치지 않는다.
      ['1002', 'B-1002-0', 0],
    ]);
    expect(answer.orders![0]).toEqual({
      orderNo: '1001',
      regNo: 'B-1001-0',
      vendor: '공급사',
      productName: '상품 1001-0',
      productCode: 'PRD-1',
      option: '',
      qty: 2,
      sellPrice: 5000,
      sellAmount: 10000,
      shipFee: 2000,
      payMethod: '신 + 포',
      orderDate: '2026-07-31 19:54:20',
      invoice: '',
      ordName: '주문자',
      group: '일반',
      ordId: 'member',
      ordEmail: 'a@b.c',
      ordTel: '02-111',
      ordMobile: '010-111',
      ordPost: '06000',
      ordAddr: '서울 강남구',
      recvName: '수취인',
      recvTel: '02-222',
      recvMobile: '010-222',
      recvPost: '07000',
      recvAddr: '서울 마포구',
      demand: '문 앞',
      memo: '',
      status: '결제완료',
    });
    const lists = requests.filter((request) => request.url === '/mall/order/basket_list.php');
    expect(lists.map((request) => request.body!.get('page'))).toEqual(['1', '2']);
    expect(lists.map((request) => [request.body!.get('search_ord_status'), request.body!.get('str_date'), request.body!.get('end_date'), request.body!.get('search_mall_name'), request.body!.get('search_on')]))
      .toEqual([['OY', '2026-07-31', '2026-07-31', '거영아이앤디', 'ture'], ['OY', '2026-07-31', '2026-07-31', '거영아이앤디', 'ture']]);
    expect(requests.filter((request) => request.url.startsWith('/mall/order/pop_order_info.php')).map((request) => request.url))
      .toEqual(['/mall/order/pop_order_info.php?orderid=1001', '/mall/order/pop_order_info.php?orderid=1002']);
  });

  it('상세를 못 읽으면 0원 주문을 만들지 않고 실패한다, 결제완료 주문이 없는 날은 0건 성공', async () => {
    await expect(load({ lists: { 1: listHtml([{ orderId: '1001' }]) }, details: { 1001: { ok: false, status: 503 } } }).handler({ date: '2026-07-31' }))
      .resolves.toEqual({ status: 'failed', error: '해법몰 주문 상세 조회 실패: 1001 (HTTP 503)' });
    await expect(load({ lists: { 1: listHtml([]) } }).handler({ date: '2026-07-31' })).resolves.toEqual({ status: 'ok', orders: [] });
  });

  it('보이는 쪽이 100쪽을 넘으면 기간 확인 없이 실패한다', async () => {
    const pages = Array.from({ length: 101 }, (_, index) => index + 1);
    const answer = await load({ lists: { 1: listHtml([], pages) } }).handler({ date: '2026-07-31' });
    expect(answer.status).toBe('failed');
    expect(answer.error).toMatch(/100페이지를 초과/);
  });

  it('로그인 화면(주소·비밀번호 칸·목록 요청이 로그인으로 넘어감)이면 login_required', async () => {
    await expect(load({ lists: {}, pageUrl: 'https://mallseller.genimarket.co.kr/mall/login.php' }).handler({ date: '2026-07-31' }))
      .resolves.toEqual({ status: 'login_required' });
    await expect(load({ lists: {}, pageHasPassword: true }).handler({ date: '2026-07-31' })).resolves.toEqual({ status: 'login_required' });
    await expect(load({ lists: {}, listUrl: 'https://mallseller.genimarket.co.kr/mall/login.php' }).handler({ date: '2026-07-31' }))
      .resolves.toEqual({ status: 'login_required' });
  });
});
