import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/sellpia-inventory.js?raw';

// 셀피아 재고 페이지 스크립트(MAIN world 파일, 옛 `requestSellpiaInventorySnapshot` 이식)를 실제 파일 그대로 돌린다.
// 가짜는 페이지 경계(fetch·location·document)뿐이다. 행은 옛 수집기 테스트(order-collector-sellpia-inventory)의 기록 그대로.
const ORIGIN = 'https://kiditem.sellpia.com';
const RAW_ROWS = [
  { product_code: '92', option_code: '2', p_title: '둘째', option_title: '', barcode: '', stock_cnt: '4', buy_price: '', sale_price: '2,000' },
  { product_code: '92', option_code: '1', p_title: '첫째', option_title: '블루', barcode: '8801234567890', stock_cnt: '39', buy_price: '1,000', sale_price: '2,000' },
];

type Handler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
type Reply = { status?: number; body?: unknown; text?: string; bytes?: Uint8Array; url?: string; redirected?: boolean; abort?: boolean; throws?: boolean };

function load(options: { replies?: Reply[]; pathname?: string; passwordInput?: boolean } = {}) {
  const requests: Array<{ url: string; init: RequestInit; body: URLSearchParams }> = [];
  const replies = [...(options.replies ?? [{ body: RAW_ROWS }])];
  const window: Record<string, unknown> = {
    __kiditemPageCalls: {},
    location: { origin: ORIGIN, pathname: options.pathname ?? '/product_list_total.html' },
  };
  const document = { querySelector: (selector: string) => (options.passwordInput && selector.includes('password') ? {} : null) };
  const fetch = async (url: string, init: RequestInit) => {
    requests.push({ url, init, body: new URLSearchParams(init.body as URLSearchParams) });
    const reply = replies.shift() ?? replies.at(-1) ?? { body: RAW_ROWS };
    if (reply.abort) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (reply.throws) throw new TypeError('Failed to fetch');
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      redirected: reply.redirected ?? false,
      url: reply.url ?? `${ORIGIN}/product_search.ajax.html`,
      text: async () => reply.text ?? JSON.stringify(reply.body),
      arrayBuffer: async () => (reply.bytes ?? new TextEncoder().encode(reply.text ?? JSON.stringify(reply.body))).buffer,
    };
  };
  new Function('window', 'document', 'fetch', source)(window, document, fetch);
  const handler = (window.__kiditemPageCalls as Record<string, Handler>)['sellpia.inventory'];
  if (!handler) throw new Error('handler not registered');
  return { handler, requests };
}

describe('sellpia inventory page script', () => {
  it('전체 목록(limit 0)을 한 번 POST하고 행을 옛 규칙대로 줄여 상품·옵션 코드 순으로 돌려준다', async () => {
    const { handler, requests } = load();
    const result = await handler({ timeoutMs: 45_000, maxRows: 20_000 });
    expect(JSON.parse(JSON.stringify(result))).toEqual({
      status: 'ok',
      rows: [
        { productCode: '92', optionCode: '1', name: '첫째', optionName: '블루', barcode: '8801234567890', currentStock: 39, purchasePrice: 1_000, salePrice: 2_000 },
        { productCode: '92', optionCode: '2', name: '둘째', optionName: null, barcode: null, currentStock: 4, purchasePrice: null, salePrice: 2_000 },
      ],
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe('/product_search.ajax.html');
    expect(requests[0]!.init).toMatchObject({ method: 'POST', credentials: 'include' });
    const sent: Record<string, string> = {};
    requests[0]!.body.forEach((value, key) => { sent[key] = value; });
    expect(sent).toEqual({
      mode: 'soldout_manager',
      search_type: '1',
      search_key: '',
      search_key2: '',
      search_key3: '',
      search_key4: '',
      soldout_include: 'Y',
      discontinued_include: 'N',
      prd_type_req: '',
      prd_cate_req: '',
      market_type_req: '',
      limit: '0',
    });
  });

  it('로그인 화면·다른 화면·비밀번호 칸·리다이렉트·401·HTML 응답은 login_required', async () => {
    const cases = [
      load({ pathname: '/login.html' }),
      load({ pathname: '/order_list.html' }),
      load({ passwordInput: true }),
      load({ replies: [{ redirected: true, url: `${ORIGIN}/login.html` }] }),
      load({ replies: [{ status: 401 }] }),
      load({ replies: [{ text: '<!DOCTYPE html><html><form>' }] }),
    ];
    for (const { handler } of cases) {
      await expect(handler({})).resolves.toEqual({ status: 'login_required' });
    }
  });

  it('HTTP 오류·연결 실패는 한 번만 더 시도하고, 시간 초과는 곧바로 timeout', async () => {
    const retried = load({ replies: [{ status: 500 }, { body: RAW_ROWS }] });
    await expect(retried.handler({})).resolves.toMatchObject({ status: 'ok' });
    expect(retried.requests).toHaveLength(2);

    const failing = load({ replies: [{ status: 500 }, { status: 502 }] });
    await expect(failing.handler({})).resolves.toEqual({ status: 'http_error', httpStatus: 502 });

    const network = load({ replies: [{ throws: true }, { throws: true }] });
    await expect(network.handler({})).resolves.toEqual({ status: 'network_error' });
    expect(network.requests).toHaveLength(2);

    const slow = load({ replies: [{ abort: true }] });
    await expect(slow.handler({})).resolves.toEqual({ status: 'timeout' });
    expect(slow.requests).toHaveLength(1);
  });

  it('JSON 아님·빈 목록·상한 초과·틀린 줄·중복 줄은 unexpected_response(사유 담아)', async () => {
    const cases: Array<[Reply, number, string]> = [
      [{ text: 'not json' }, 20_000, 'not_json'],
      [{ body: { rows: [] } }, 20_000, 'not_list'],
      [{ body: [] }, 20_000, 'empty'],
      [{ body: RAW_ROWS }, 1, 'too_many_rows'],
      [{ body: [{ ...RAW_ROWS[0], stock_cnt: '-1' }] }, 20_000, 'invalid_row'],
      [{ body: [RAW_ROWS[0], RAW_ROWS[0]] }, 20_000, 'duplicate_row'],
    ];
    for (const [reply, maxRows, reason] of cases) {
      await expect(load({ replies: [reply] }).handler({ maxRows })).resolves.toEqual({ status: 'unexpected_response', reason });
    }
  });

  it('크기 상한은 글자 수가 아니라 바이트로 재고, UTF-8이 깨진 응답은 not_json이다', async () => {
    const korean = JSON.stringify(RAW_ROWS);
    const bytes = new TextEncoder().encode(korean).byteLength;
    expect(bytes).toBeGreaterThan(korean.length);
    await expect(load({ replies: [{ text: korean }] }).handler({ maxRows: 20_000, maxBytes: korean.length }))
      .resolves.toEqual({ status: 'unexpected_response', reason: 'too_large' });
    await expect(load({ replies: [{ text: korean }] }).handler({ maxRows: 20_000, maxBytes: bytes }))
      .resolves.toMatchObject({ status: 'ok' });
    await expect(load({ replies: [{ bytes: new Uint8Array([0x5b, 0xff, 0x5d]) }] }).handler({ maxRows: 20_000 }))
      .resolves.toEqual({ status: 'unexpected_response', reason: 'not_json' });
  });
});
