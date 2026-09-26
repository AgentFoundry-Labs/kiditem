// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/page-call/kidsnote-orders.js?raw';

// 키즈노트 주문 페이지 스크립트(ISOLATED world 파일, 옛 worker.js `scrapeKidsnoteOrders` 이식)를 실제 파일 그대로 돌린다.
// DOM 파서는 jsdom, 가짜는 페이지 경계(fetch)뿐이다. DOMParser로 만든 문서는 그려지지 않으므로 브라우저에서도
// `innerText`가 `textContent`와 같다(HTML 표준) — jsdom에 없는 그 속성만 같은 뜻으로 채운다.
beforeAll(() => {
  // 확장 tsconfig에는 DOM 타입이 없다 — jsdom 전역에서 꺼낸다.
  const { HTMLElement } = globalThis as unknown as { HTMLElement: { prototype: object } };
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: { textContent: string | null }) {
      return this.textContent;
    },
  });
});

const listRow = (ono: string, pno: string, time: string, product: string, buyer: string) => `
  <tr><td><input type="checkbox" name="check_pno[]" value="${pno}"></td><td>${ono}</td><td><a href="javascript:viewOrder('${ono}')">${ono}</a></td>
  <td>${product}</td><td>${ono.slice(0, 4)}-${ono.slice(4, 6)}-${ono.slice(6, 8)} ${time}</td><td>${buyer}</td><td>12,000</td><td>11,000</td><td>카드</td><td>결제완료</td></tr>`;

const LIST_PAGE_1 = `<html><body><table>
  <tr><td>선택</td><td>주문번호</td><td>보기</td><td>주문상품</td><td>주문일시</td><td>주문자</td><td>총주문액</td><td>실결제</td><td>결제방법</td><td>상태</td></tr>
  ${listRow('20260927-00003', 'P3', '09:00:00', '내일 주문', '김*수')}
  ${listRow('20260926-00002', 'P2', '15:10:00', '색종이 외 1건', '박*희')}
  ${listRow('20260926-00001', 'P1', '10:05', '크레파스', '이*진')}
  ${listRow('20260925-00009', 'P9', '11:00:00', '어제 주문', '최*호')}
</table></body></html>`;

const PRINT_P2 = `<html><body>
<p>○ 주문상품</p>
<p>○ 주문정보</p>
<p>결제방법</p>
<p>무통장입금</p>
<p>○ 주문자</p>
<p>이름</p>
<p>박영희 (parent01)</p>
<p>○ 배송지</p>
<p>이름</p>
<p>행복유치원</p>
<p>연락처</p>
<p>02-111-2222 / 010-1234-5678</p>
<p>주소</p>
<p>[06000] 서울 강남구 테헤란로 1</p>
<p>배송메세지</p>
<p>문 앞에 두세요</p>
</body></html>`;

const VIEW_P2 = `<html><body>
<p>결제완료 2026-09-26 15:12</p>
<table>
  <tr><td>선택</td><td>주문번호</td><td>제품명</td><td>상품가격</td><td>수량</td><td>할인적용</td><td>금액</td><td>배송비</td><td>소계</td><td>주문상태</td><td>속성</td></tr>
  <tr><td></td><td>20260926-00002</td><td><a>색종이 세트</a> <a>[재고상세]</a> 주식회사 키드</td><td>3,000</td><td>2</td><td>0</td><td>6,000</td><td>3,000</td><td>9,000</td><td>결제완료</td><td></td></tr>
  <tr><td></td><td>20260926-00002</td><td><a>풀</a></td><td>1,000</td><td>1</td><td>0</td><td>1,000</td><td>0</td><td>1,000</td><td>결제완료</td><td></td></tr>
  <tr><td colspan="11">변경내역</td></tr>
</table>
</body></html>`;

type Answer = { status: string; orders?: Array<Record<string, unknown>>; error?: string };

function load(pages: Record<string, { ok?: boolean; status?: number; html: string }>) {
  const requests: Array<{ url: string; body?: string }> = [];
  const isolated: Record<string, unknown> = {};
  const fetch = async (url: string, init?: RequestInit) => {
    requests.push({ url, ...(init?.body ? { body: String(init.body) } : {}) });
    const key = init?.body ? `POST ${String(init.body)}` : url;
    const page = pages[key] ?? { html: '<html><body></body></html>' };
    return { ok: page.ok ?? true, status: page.status ?? 200, text: async () => page.html };
  };
  new Function('globalThis', 'fetch', source)(isolated, fetch);
  const handler = (isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Promise<Answer>>)['kidsnote.orders']!;
  return { handler, requests };
}

const listUrl = (page: number) =>
  `/_manage/?body=3010&search_date_type=1&all_date=N&start_date=2026-09-26&finish_date=2026-09-26&page=${page}`;

describe('kidsnote orders page script', () => {
  it('그날 주문만 목록에서 골라 주문서 인쇄·주문보기로 수취인·품목을 붙인다(읽기만)', async () => {
    const { handler, requests } = load({
      [listUrl(1)]: { html: LIST_PAGE_1 },
      'POST body=order@order_print.frm&check_pno[]=P2': { html: PRINT_P2 },
      '/_manage/?body=order@order_view.frm&ono=20260926-00002': { html: VIEW_P2 },
    });
    const answer = await handler({ from: '2026-09-26', to: '2026-09-26', status: '', withDetail: true });
    expect(answer.status).toBe('ok');
    expect(answer.orders).toHaveLength(2);
    expect(answer.orders![0]).toEqual({
      ono: '20260926-00002',
      pno: 'P2',
      orderDate: '2026-09-26',
      orderedAt: '2026-09-26 15:10:00',
      productName: '색종이 외 1건',
      ordererName: '박영희',
      totalAmount: 12000,
      paidAmount: 11000,
      payMethod: '무통장입금',
      status: '결제완료',
      receiver: '행복유치원',
      mobile: '010-1234-5678',
      tel: '',
      zip: '06000',
      address: '서울 강남구 테헤란로 1',
      request: '문 앞에 두세요',
      paidAt: '2026-09-26 15:12',
      items: [
        { productName: '색종이 세트', qty: 2, option: '', amount: 6000, shipFee: 3000 },
        { productName: '풀', qty: 1, option: '', amount: 1000, shipFee: 0 },
      ],
    });
    // 상세를 읽지 못한 주문은 목록 상품 하나로 채운다(옛 규칙).
    expect(answer.orders![1]).toMatchObject({ ono: '20260926-00001', orderedAt: '2026-09-26 10:05', items: [{ productName: '크레파스', qty: 1, option: '', amount: 0, shipFee: 0 }] });
    // 범위보다 과거 주문을 만나면 목록을 더 넘기지 않는다. 읽기만 한다(GET 목록·주문보기, 주문서 인쇄 POST).
    expect(requests.filter((request) => request.url.includes('body=3010')).map((request) => request.url)).toEqual([listUrl(1)]);
    expect(requests.every((request) => !request.body || request.body.startsWith('body=order@order_print.frm'))).toBe(true);
  });

  it('목록 표가 없으면 로그인 화면은 login_required, 로그인한 빈 목록은 0건 성공, 첫 쪽 HTTP 오류는 failed', async () => {
    await expect(load({ [listUrl(1)]: { html: '<html><body><form><input type="password"></form></body></html>' } })
      .handler({ from: '2026-09-26', to: '2026-09-26', status: '', withDetail: true })).resolves.toEqual({ status: 'login_required' });
    await expect(load({ [listUrl(1)]: { html: '<html><body><p>조회된 주문이 없습니다</p></body></html>' } })
      .handler({ from: '2026-09-26', to: '2026-09-26', status: '', withDetail: true })).resolves.toEqual({ status: 'ok', orders: [] });
    await expect(load({ [listUrl(1)]: { ok: false, status: 500, html: '' } })
      .handler({ from: '2026-09-26', to: '2026-09-26', status: '', withDetail: true }))
      .resolves.toEqual({ status: 'failed', error: '키즈노트 주문 조회 실패 (HTTP 500)' });
  });
});
