import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/sellpia-profit.js?raw';

// 셀피아 상품별 이익현황 페이지 스크립트(MAIN world 파일, 옛 `scrapeSellpiaProductProfit`의 한 번 조회·줄 검증 이식)를 실제
// 파일 그대로 돌린다. 가짜는 페이지 경계(fetch·location·document)뿐이다. 응답은 옛 수집기 테스트(sellpia-product-profit)의 기록.
type Handler = (args: Record<string, string>) => Promise<Record<string, unknown>>;

function load(options: { body?: unknown; text?: string; status?: number; pathname?: string } = {}) {
  const requests: URLSearchParams[] = [];
  const window: Record<string, unknown> = { __kiditemPageCalls: {}, location: { pathname: options.pathname ?? '/stat_prd_profit.html' } };
  const document = { querySelector: () => null };
  const fetch = async (url: string, init: RequestInit) => {
    expect(url).toBe('stat_action.ajax.html');
    requests.push(new URLSearchParams(String(init.body)));
    const status = options.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => options.text ?? JSON.stringify(options.body) };
  };
  new Function('window', 'document', 'fetch', source)(window, document, fetch);
  const handler = (window.__kiditemPageCalls as Record<string, Handler>)['sellpia.profitRows'];
  if (!handler) throw new Error('handler not registered');
  return { handler, requests };
}

const WINDOW = { start: '2025-05-26', end: '2026-06-30' };
const row = (overrides: Record<string, unknown> = {}) => ({
  product_code: 'SKU-1',
  option_code: 'OPTION-1',
  product_name: '상품',
  total_order_amount: 1000,
  total_order_qty: 2,
  total_in_amount: 400,
  total_in_qty: 1,
  graph: { '2026-06': '0,1000,2' },
  ...overrides,
});

describe('sellpia profit page script', () => {
  it('판매 창은 고정하고 구매기간만 인자로 바꿔 한 번 POST하고, 상품 줄을 월별로 정리한다', async () => {
    const { handler, requests } = load({ body: [row({ graph: { '2026-04': '400,1000,2', '2026-06': '600,1500,3' }, total_order_amount: 2500, total_order_qty: 5, total_in_amount: 1000, total_in_qty: 5 })] });
    const result = await handler({ ...WINDOW, purchaseStart: '2026-04-01', purchaseEnd: '2026-04-30' });
    const sent: Record<string, string> = {};
    requests[0]!.forEach((value, key) => { sent[key] = value; });
    expect(sent).toMatchObject({
      mode: 'stat_prd_profit', s_date: '2025-05-26', e_date: '2026-06-30', in_s_date: '2026-04-01', in_e_date: '2026-04-30', buy_point: 'R', vat_tp: '1', period_free: 'false',
    });
    expect(result).toEqual({
      status: 'ok',
      skippedAdjustmentCount: 0,
      products: [{
        productCode: 'SKU-1', optionCode: 'OPTION-1', productName: '상품', salePrice: 0, buyPrice: 0,
        months: [
          { yearMonth: '2026-04', inAmount: 400, orderAmount: 1000, orderQty: 2 },
          { yearMonth: '2026-06', inAmount: 600, orderAmount: 1500, orderQty: 3 },
        ],
        totalOrderAmount: 2500, totalOrderQty: 5, totalInAmount: 1000, totalInQty: 5,
      }],
    });
  });

  it('일별 그래프 키는 연도가 하나로 정해질 때만 달로 합친다', async () => {
    const daily = [row({ product_code: 'SKU-DAILY', option_code: '', graph: { '9/1': '0,100,1', '09/02': '0,200,2' }, total_order_amount: 300, total_order_qty: 3, total_in_amount: 250, total_in_qty: 2 })];
    const ok = await load({ body: daily }).handler({ start: '2026-09-01', end: '2026-09-06', purchaseStart: '2026-09-01', purchaseEnd: '2026-09-06' });
    expect(ok).toMatchObject({ status: 'ok', products: [{ months: [{ yearMonth: '2026-09', inAmount: 0, orderAmount: 300, orderQty: 3 }] }] });
    const ambiguous = await load({ body: [row({ graph: { '9/1': '0,1000,2' } })] }).handler({ start: '2025-09-01', end: '2026-09-06', purchaseStart: '2025-09-01', purchaseEnd: '2026-09-06' });
    expect(ambiguous).toEqual({ status: 'unexpected_response', reason: 'invalid_row' });
  });

  it('틀리거나 일부만 맞거나 너무 큰 응답은 한 줄도 돌려주지 않는다', async () => {
    const invalid = [
      [{ product_code: '', graph: { '2026-06': '1,2,3' } }],
      [{ product_code: 'SKU-1', graph: { '2026-06': '1,not-a-number,3' } }],
      [{ product_code: 'SKU-1', graph: { '2026-13': '1,2,3' } }],
      [{ product_code: 'SKU-1', graph: { '2026-06': '1,2' } }],
      [row({ total_order_amount: true })],
      [row({ total_order_amount: {} })],
      [row({ total_order_qty: null })],
      [{ product_code: 'SKU-1', graph: { '2026-06': '1,2,3', '6/01': '0,0,0' } }],
      [{ product_code: 'SKU-1', graph: [] }],
      [row(), row()],
      [row({ product_code: 'SKU-RETURN', sale_price: 12_000, buy_price: 7_000, dp_code: '8800000000002', graph: { '2026-06': '0,-12000,1' } })],
    ];
    for (const body of invalid) {
      await expect(load({ body }).handler({ ...WINDOW, purchaseStart: WINDOW.start, purchaseEnd: WINDOW.end })).resolves.toEqual({ status: 'unexpected_response', reason: 'invalid_row' });
    }
    const oversized = Array.from({ length: 20_001 }, (_, index) => ({ product_code: `SKU-${index}`, graph: { '2026-06': '1,2,3' } }));
    await expect(load({ body: oversized }).handler({ ...WINDOW, purchaseStart: WINDOW.start, purchaseEnd: WINDOW.end })).resolves.toEqual({ status: 'unexpected_response', reason: 'not_list' });
  });

  it('순수 금융 조정 줄(할인)만 빼고 상품 근거는 지킨다', async () => {
    const result = await load({
      body: [
        row({ product_name: '정상 상품', sale_price: 12_000, buy_price: 7_000, dp_code: '8800000000001', total_order_amount: 12_000, total_order_qty: 1, total_in_amount: 7_000, total_in_qty: 1, graph: { '2026-06': '7000,12000,1' } }),
        { product_code: '7382', option_code: '1', product_name: '할인', sale_price: 0, buy_price: 0, dp_code: '', graph: { '2026-06': '0,-27225,1' } },
      ],
    }).handler({ start: '2026-06-01', end: '2026-06-30', purchaseStart: '2026-06-01', purchaseEnd: '2026-06-30' });
    expect(result).toMatchObject({ status: 'ok', skippedAdjustmentCount: 1, products: [{ productCode: 'SKU-1', barcode: '8800000000001' }] });
  });

  it('로그인 화면·HTML 응답은 login_required, HTTP 오류는 http_error', async () => {
    const args = { ...WINDOW, purchaseStart: WINDOW.start, purchaseEnd: WINDOW.end };
    await expect(load({ pathname: '/login.html' }).handler(args)).resolves.toEqual({ status: 'login_required' });
    await expect(load({ text: '<html><form>' }).handler(args)).resolves.toEqual({ status: 'login_required' });
    await expect(load({ status: 503, body: [] }).handler(args)).resolves.toEqual({ status: 'http_error', httpStatus: 503 });
  });
});
