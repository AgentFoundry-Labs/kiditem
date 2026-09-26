// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/page-call/onch-orders.js?raw';

// 온채널 주문 페이지 스크립트(ISOLATED world 파일, 옛 worker.js `scrapeOnchannelOrders` 이식)를 실제 파일 그대로 돌린다.
// DOM 파서는 jsdom, 가짜는 페이지 경계(fetch)뿐이다. DOMParser 문서는 그려지지 않아 브라우저에서도 `innerText`가
// `textContent`와 같다(HTML 표준) — jsdom에 없는 그 속성만 같은 뜻으로 채운다.
beforeAll(() => {
  const { HTMLElement } = globalThis as unknown as { HTMLElement: { prototype: object } };
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: { textContent: string | null }) {
      return this.textContent;
    },
  });
});

const LIST_URL = '/supplier/orders.php?state=all';
const DETAIL_URL = '/access/order_access.php?ubr=order_detail_supplier';

const listRow = (code: string, date: string) =>
  `<tr><td><a href="#" onclick="supplierOrderDetailModal('${code}')">${code}</a></td><td>${date}</td><td>${date.slice(0, 10)} 18:00:00</td></tr>`;
const LIST_HTML = `<html><body><table>
  <tr><td>주문코드</td><td>주문일자</td><td>수정일</td></tr>
  ${listRow('OC-2', '2026-09-26 14:00:00')}
  ${listRow('OC-1', '2026-09-26 09:30:00')}
  ${listRow('OC-1', '2026-09-26 09:30:00')}
  ${listRow('OC-0', '2026-09-25 17:00:00')}
</table></body></html>`;

const modal = (name: string) => `<html><body>
  <p>(P-100) ${name} 옵션</p>
  <table><tr><td>상품금액</td><td>배송비</td></tr><tr><td>12,000</td><td>3,000</td></tr></table>
  <table><tr><td>옵션</td><td>수량</td></tr><tr><td>빨강</td><td>2</td></tr></table>
  <table>
    <tr><td>받는 사람</td><td>행복유치원</td></tr>
    <tr><td>전화번호</td><td>010-1234-5678</td></tr>
    <tr><td>비상 연락처</td><td>02-111-2222</td></tr>
    <tr><td>주소</td><td>(06000) 서울 강남구 테헤란로 1</td></tr>
    <tr><td>배송 메시지</td><td>문 앞</td></tr>
  </table>
</body></html>`;

type Answer = { status: string; orders?: Array<Record<string, unknown>>; error?: string };

function load(options: { list?: { url?: string; html: string }; detail?: (code: string) => string | Error } = {}) {
  const requests: Array<{ url: string; body?: string }> = [];
  const isolated: Record<string, unknown> = {};
  const fetch = async (url: string, init?: RequestInit) => {
    requests.push({ url, ...(init?.body ? { body: String(init.body) } : {}) });
    if (url === LIST_URL) {
      const list = options.list ?? { html: LIST_HTML };
      return { url: list.url ?? `https://www.onch3.co.kr${LIST_URL}`, text: async () => list.html };
    }
    const code = new URLSearchParams(String(init?.body)).get('orderCode') ?? '';
    const detail = options.detail ? options.detail(code) : modal(`상품 ${code}`);
    if (detail instanceof Error) throw detail;
    return { url: `https://www.onch3.co.kr${url}`, text: async () => detail };
  };
  new Function('globalThis', 'fetch', source)(isolated, fetch);
  const handler = (isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Promise<Answer>>)['onch.orders']!;
  return { handler, requests };
}

describe('onch orders page script', () => {
  it('목록에서 그날 주문코드를 한 번씩 골라 주문마다 상세 모달을 읽는다(읽기만)', async () => {
    const { handler, requests } = load();
    const answer = await handler({ dateFilter: '2026-09-26' });
    expect(answer.status).toBe('ok');
    expect(answer.orders).toEqual([
      {
        orderCode: 'OC-2',
        date: '2026-09-26 14:00:00',
        productCode: 'P-100',
        productName: '상품 OC-2',
        option: '빨강',
        qty: 2,
        productPrice: 12000,
        shippingFee: 3000,
        customer: '행복유치원',
        phone: '010-1234-5678',
        emergency: '02-111-2222',
        zip: '06000',
        address: '서울 강남구 테헤란로 1',
        message: '문 앞',
      },
      expect.objectContaining({ orderCode: 'OC-1', date: '2026-09-26 09:30:00', productName: '상품 OC-1' }),
    ]);
    expect(requests.map((request) => request.url)).toEqual([LIST_URL, DETAIL_URL, DETAIL_URL]);
    expect(requests.slice(1).map((request) => request.body)).toEqual(['orderCode=OC-2', 'orderCode=OC-1']);
  });

  it('상세를 못 읽은 주문은 주문코드·일자만 남긴다(옛 규칙), 그날 주문이 없으면 0건 성공', async () => {
    const partial = await load({ detail: (code) => (code === 'OC-1' ? new Error('network') : modal('상품')) }).handler({ dateFilter: '2026-09-26' });
    expect(partial.orders).toContainEqual({ orderCode: 'OC-1', date: '2026-09-26 09:30:00' });
    await expect(load().handler({ dateFilter: '2026-09-27' })).resolves.toEqual({ status: 'ok', orders: [] });
  });

  it('목록에 주문이 하나도 없으면 로그인 화면은 login_required, 그 밖은 옛 문장으로 failed', async () => {
    await expect(load({ list: { url: 'https://www.onch3.co.kr/login/login_web.php', html: '<html><body><form></form></body></html>' } }).handler({ dateFilter: '2026-09-26' }))
      .resolves.toEqual({ status: 'login_required' });
    await expect(load({ list: { html: '<html><body><input type="password"></body></html>' } }).handler({ dateFilter: '2026-09-26' }))
      .resolves.toEqual({ status: 'login_required' });
    await expect(load({ list: { html: '<html><body><p>점검 중</p></body></html>' } }).handler({ dateFilter: '2026-09-26' }))
      .resolves.toEqual({ status: 'failed', error: '온채널 주문 목록을 찾지 못했습니다. onch3.co.kr 로그인을 확인하세요.' });
  });
});
