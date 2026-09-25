import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/sellpia-shipment-tracking.js?raw';

// 셀피아 송장 페이지 스크립트(MAIN world 파일, 옛 `scrapeSellpiaDeliTracking` 이식)를 실제 파일 그대로 돌린다.
// 가짜는 페이지 경계(fetch·location·document)뿐이다. 응답은 옛 수집기 테스트의 기록 그대로.

type Handler = (args: { startDate: string; endDate: string }) => Promise<Record<string, unknown>>;

function load(options: { body?: unknown; text?: string; status?: number; pathname?: string; passwordInput?: boolean } = {}) {
  const requests: Array<{ url: string; init: RequestInit; body: URLSearchParams }> = [];
  const window: Record<string, unknown> = { __kiditemPageCalls: {}, location: { pathname: options.pathname ?? '/order_delivery_reprint.html' } };
  const document = { querySelector: (selector: string) => (options.passwordInput && selector.includes('password') ? {} : null) };
  const fetch = async (url: string, init: RequestInit) => {
    requests.push({ url, init, body: new URLSearchParams(String(init.body)) });
    const status = options.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => options.text ?? JSON.stringify(options.body) };
  };
  new Function('window', 'document', 'fetch', source)(window, document, fetch);
  const handler = (window.__kiditemPageCalls as Record<string, Handler>)['sellpia.shipmentTracking'];
  if (!handler) throw new Error('handler not registered');
  return { handler, requests };
}

describe('sellpia shipment tracking page script', () => {
  it('송장번호채번일자(delinum_date)로 조회 기간을 POST하고 행을 옛 규칙대로 줄인다(몰명 괄호 제거·주소 합치기)', async () => {
    const { handler, requests } = load({
      body: {
        list: [{
          group_no: 'GROUP_ORDER-1',
          delinum: '  INV-1 ',
          delicom: '1136',
          receiver: '홍길동 (스마트스토어)',
          receiver_post: '06000',
          receiver_addr1: '서울',
          receiver_addr2: ' 1층 ',
          ship_info: { ord_no: 'ORDER-1', provider_name: '스마트스토어' },
        }],
      },
    });
    const result = await handler({ startDate: '2026-09-07', endDate: '2026-09-08' });
    expect(JSON.parse(JSON.stringify(result))).toEqual({
      status: 'ok',
      rows: [{ ordNo: 'ORDER-1', itemNo: '', invNo: 'INV-1', courier: '1136', provider: '스마트스토어', receiver: '홍길동', post: '06000', addr: '서울 1층' }],
      total: 1,
      range: { start: '2026-09-07', end: '2026-09-08' },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe('delivery_link.action.html');
    expect(requests[0]!.init).toMatchObject({ method: 'POST', credentials: 'include' });
    const sent: Record<string, string> = {};
    requests[0]!.body.forEach((value, key) => { sent[key] = value; });
    expect(sent).toEqual({
      domode: 'GET_ORDER_DELIVERY_REPRINT_LIST',
      date_type: 'delinum_date',
      s_date: '2026-09-07',
      e_date: '2026-09-08',
      delinum: '',
      receiver: '',
      onlydeli_sellpia_code: '',
      pick_num: '',
    });
  });

  it('주문번호·송장번호가 없는 줄은 뺀다(주문번호는 group_no 끝 조각으로 대신한다)', async () => {
    const { handler } = load({
      body: {
        list: [
          { delinum: 'INV-MISSING-ORDER' },
          { group_no: 'GROUP_MISSING_INVOICE', delinum: '', ship_info: { ord_no: 'ORDER-MISSING-INVOICE' } },
          { group_no: 'GROUP_VALID', delinum: 'INV-VALID', ship_info: { ord_no: 'ORDER-VALID' } },
          { group_no: 'G_FROM-GROUP', delinum: 'INV-G' },
        ],
      },
    });
    const result = await handler({ startDate: '2026-09-07', endDate: '2026-09-07' });
    expect((result.rows as Array<{ ordNo: string }>).map((row) => row.ordNo)).toEqual(['ORDER-VALID', 'FROM-GROUP']);
    expect(result.total).toBe(4);
  });

  it('로그인 화면·HTML 응답은 login_required, HTTP 오류는 http_error, list 없는 JSON은 unexpected_response', async () => {
    await expect(load({ pathname: '/login.html' }).handler({ startDate: '2026-09-07', endDate: '2026-09-07' })).resolves.toEqual({ status: 'login_required' });
    await expect(load({ passwordInput: true }).handler({ startDate: '2026-09-07', endDate: '2026-09-07' })).resolves.toEqual({ status: 'login_required' });
    await expect(load({ text: '<!DOCTYPE html><html><form>' }).handler({ startDate: '2026-09-07', endDate: '2026-09-07' })).resolves.toEqual({ status: 'login_required' });
    await expect(load({ status: 500, body: { message: 'failed' } }).handler({ startDate: '2026-09-07', endDate: '2026-09-07' })).resolves.toEqual({ status: 'http_error', httpStatus: 500 });
    for (const body of [null, {}, { list: null }, { list: {} }]) {
      await expect(load({ body }).handler({ startDate: '2026-09-07', endDate: '2026-09-07' })).resolves.toEqual({ status: 'unexpected_response' });
    }
  });
});
