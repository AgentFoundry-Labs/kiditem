// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/kidkids-orders.js?raw';

// 키드키즈 주문 페이지 스크립트(ISOLATED world 파일, 옛 worker.js `scrapeKidkidsOrders` 이식)를 실제 파일 그대로 돌린다.
// DOM 파서는 jsdom, 가짜는 페이지 경계(fetch·location·EUC-KR 디코딩)뿐이다.
const MANAGEMENT = 'https://partner.kidkids.net/new/pages/logis/management.htm';
const LIST_URL = 'https://partner.kidkids.net/logis/logis_index.htm?from_logis_index=Y&page_view_cnt=500';

const LIST_HTML = `<html><body><table>
  <tr><td>선택</td><td>주문번호</td><td>주문일</td><td>주문자명</td><td>상품명</td><td>수량</td><td>전화</td><td>휴대폰</td><td>출고예정일</td></tr>
  <tr><td><input name="CheckBox2" value="od-1"></td><td>OM-1</td><td>2026-09-26 10:00:00</td><td>풍산초 병설유치원</td><td>목록 상품</td><td>2</td><td>02-111</td><td>010-111</td><td></td></tr>
  <tr><td><input name="CheckBox2" value="od-2"></td><td>OM-1</td><td>2026-09-26 10:00:00</td><td>풍산초 병설유치원</td><td>목록 상품 2</td><td>1</td><td>02-111</td><td>010-111</td><td></td></tr>
  <tr><td><input name="CheckBox2" value="od-3"></td><td>OM-2</td><td>2026-09-25 09:00:00</td><td>어제 유치원</td><td>어제 상품</td><td>1</td><td></td><td></td><td></td></tr>
  <tr><td><input name="CheckBox2" value="od-4"></td><td>OM-3</td><td>2026-09-26 11:00:00</td><td>발주서 없는 곳</td><td>목록만 상품</td><td>3</td><td>02-333</td><td>010-333</td><td></td></tr>
</table></body></html>`;

const DOWN4_HTML = `<html><body><table>
  <tr><td>이름</td><td>전화</td><td>휴대폰</td><td>우편번호</td><td>주소</td><td>상품명</td><td>옵션</td><td>수량</td><td>공급단가</td><td>합계</td><td>배송요청</td><td>키코드</td></tr>
  <tr><td>풍산초</td><td>02-999</td><td>010-999</td><td>06000</td><td>서울 강남구 1</td><td>[키드아이템] 색종이(1BOX/12개)[2]</td><td>빨강</td><td>2</td><td>1,000</td><td>2,000</td><td>문 앞</td><td>od-1</td></tr>
  <tr><td>풍산초</td><td>02-999</td><td>010-999</td><td>06000</td><td>서울 강남구 1</td><td>[키드아이템] 색종이(1BOX/12개)[2]</td><td>빨강</td><td>2</td><td>1,000</td><td>2,000</td><td>문 앞</td><td>od-1</td></tr>
  <tr><td>풍산초</td><td>02-999</td><td>010-999</td><td>06000</td><td>서울 강남구 1</td><td>크레파스</td><td></td><td>1</td><td>500</td><td>500</td><td></td><td>od-1</td></tr>
</table></body></html>`;

type Answer = { status: string; orders?: Array<Record<string, unknown>> };

function load(options: { pageUrl?: string; listUrl?: string; listHtml?: string; down4Html?: string } = {}) {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const isolated: Record<string, unknown> = {};
  const body = (html: string) => ({ html });
  const fetch = async (url: string, init?: RequestInit) => {
    requests.push({ url, ...(init ? { init } : {}) });
    const isList = url.startsWith('/logis/logis_index.htm');
    return {
      url: isList ? (options.listUrl ?? LIST_URL) : `https://partner.kidkids.net${url}`,
      arrayBuffer: async () => body(isList ? (options.listHtml ?? LIST_HTML) : (options.down4Html ?? DOWN4_HTML)),
    };
  };
  class EucKrDecoder {
    constructor(readonly label: string) {}
    decode(buffer: { html: string }) {
      expect(this.label).toBe('euc-kr');
      return buffer.html;
    }
  }
  new Function('window', 'globalThis', 'fetch', 'TextDecoder', source)(
    { location: { href: options.pageUrl ?? MANAGEMENT } },
    isolated,
    fetch,
    EucKrDecoder,
  );
  const handler = (isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Promise<Answer>>)['kidkids.orders']!;
  return { handler, requests };
}

describe('kidkids orders page script', () => {
  it('그날 주문만 목록에서 고르고 주문번호마다 발주서02를 붙여 옛 변환 본문의 주문으로 만든다(읽기만)', async () => {
    const { handler, requests } = load();
    const answer = await handler({ dateFilter: '2026-09-26' });
    expect(answer).toEqual({
      status: 'ok',
      orders: [
        {
          om: 'OM-1',
          // 옛 수집기 그대로: 발주서02 행에 이름 칸을 옮겨 담지 않아 목록 주문자명이 쓰인다(파생으로 보고).
          ordName: '풍산초 병설유치원',
          orderDate: '2026-09-26 10:00:00',
          recvName: '풍산초 병설유치원',
          recvAddr: '06000 서울 강남구 1',
          recvTel: '02-999',
          recvMobile: '010-999',
          recvMsg: '문 앞',
          items: [
            { name: '[키드아이템] 색종이(1BOX/12개) 빨강', qty: 2, unit: 1000, sum: 2000 },
            { name: '크레파스', qty: 1, unit: 500, sum: 500 },
          ],
        },
        {
          om: 'OM-3',
          ordName: '발주서 없는 곳',
          orderDate: '2026-09-26 11:00:00',
          recvName: '발주서 없는 곳',
          recvAddr: '',
          recvTel: '02-333',
          recvMobile: '010-333',
          recvMsg: '',
          items: [{ name: '목록만 상품', qty: 3, unit: 0, sum: 0 }],
        },
      ],
    });
    expect(requests.map((request) => request.url)).toEqual(['/logis/logis_index.htm?from_logis_index=Y&page_view_cnt=500', '/logis/logis_down4.htm']);
    const sent: Record<string, string> = {};
    new URLSearchParams(String(requests[1]!.init?.body)).forEach((value, key) => { sent[key] = value; });
    expect(sent).toEqual({ from_logis_index: 'Y', mul_id: '|od-1|od-4', mode: 'xls_down' });
    // 출고예정등록(sales_process.htm, 실주문 상태 변경)은 보내지 않는다.
    expect(requests.some((request) => request.url.includes('sales_process'))).toBe(false);
  });

  it('로그인한 빈 목록은 0건 성공, 본인확인 화면·로그인 리다이렉트는 login_required', async () => {
    await expect(load({ listHtml: '<html><body><p>주문 없음</p></body></html>' }).handler({ dateFilter: '2026-09-26' }))
      .resolves.toEqual({ status: 'ok', orders: [] });
    await expect(load({ pageUrl: 'https://partner.kidkids.net/new/pages/security/verify_user.htm' }).handler({ dateFilter: '2026-09-26' }))
      .resolves.toEqual({ status: 'login_required' });
    await expect(load({ listUrl: 'https://www.kidkids.net/join/partner_login.htm', listHtml: '<html><body><form></form></body></html>' }).handler({}))
      .resolves.toEqual({ status: 'login_required' });
  });
});
