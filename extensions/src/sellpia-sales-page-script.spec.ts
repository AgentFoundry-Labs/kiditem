import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/sellpia-sales.js?raw';

// 셀피아 판매현황 페이지 스크립트(MAIN world 파일, 옛 `scrapeSellpiaSaleSummary` 이식)를 실제 파일 그대로 돌린다.
// 가짜는 페이지 경계(fetch·location·document·판매처 이름표 전역)뿐이다. 응답은 옛 수집기 테스트(sellpia-sales-cache)의 기록 그대로.
type Handler = (args: { startDate: string; endDate: string }) => Promise<Record<string, unknown>>;

function load(options: { body?: unknown; text?: string; status?: number; pathname?: string; names?: Record<string, string> } = {}) {
  const requests: Array<{ url: string; init: RequestInit; body: URLSearchParams }> = [];
  const window: Record<string, unknown> = {
    __kiditemPageCalls: {},
    location: { pathname: options.pathname ?? '/sale_summary.html' },
    provider_list_all: options.names ?? { 118: '스마트스토어' },
  };
  const document = { querySelector: () => null };
  const fetch = async (url: string, init: RequestInit) => {
    requests.push({ url, init, body: new URLSearchParams(String(init.body)) });
    const status = options.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => options.text ?? JSON.stringify(options.body) };
  };
  new Function('window', 'document', 'fetch', source)(window, document, fetch);
  const handler = (window.__kiditemPageCalls as Record<string, Handler>)['sellpia.sales'];
  if (!handler) throw new Error('handler not registered');
  return { handler, requests };
}

const RANGE = { startDate: '2026-07-17', endDate: '2026-07-18' };

describe('sellpia sales page script', () => {
  it('기간 전체를 판매처 all·주문일자 기준으로 한 번 POST하고 판매처·일 줄로 편다(숫자 0·쉼표 금액 유지)', async () => {
    const { handler, requests } = load({ body: { 118: { '2026-07-17': { price: '1,200', amount: '0', buy_price: 700, extra_metric: 'allowed' } } } });
    await expect(handler(RANGE)).resolves.toEqual({
      status: 'ok',
      rows: [{ sellerId: '118', sellerName: '스마트스토어', date: '2026-07-17', price: 1_200, amount: 0, buyPrice: 700 }],
      sellers: 1,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe('order_search.ajax.html');
    expect(requests[0]!.init).toMatchObject({ method: 'POST', credentials: 'include' });
    const sent: Record<string, string> = {};
    requests[0]!.body.forEach((value, key) => { sent[key] = value; });
    expect(sent).toMatchObject({ mode: 'selldate', s_date: '2026-07-17', e_date: '2026-07-18', seller: 'all', s_type: '1' });
  });

  it('구조상 빈 객체만 빈 판매현황이다', async () => {
    await expect(load({ body: {} }).handler(RANGE)).resolves.toEqual({ status: 'ok', rows: [], sellers: 0 });
  });

  it('오류 봉투·배열·null·모르는 판매처는 한 줄도 돌려주지 않는다', async () => {
    for (const body of [
      null,
      [],
      { success: false, error: 'login required' },
      { filtered: {} },
      { constructor: { '2026-07-17': { price: 1, amount: 1, buy_price: 1 } } },
      { 999: { '2026-07-17': { price: 1, amount: 1, buy_price: 1 } } },
    ]) {
      const result = await load({ body }).handler(RANGE);
      expect(result.status, JSON.stringify(body)).toBe('unexpected_response');
      expect(result.rows).toBeUndefined();
    }
  });

  it('일부만 맞는 판매처·일자 응답은 통째로 실패한다(조용히 건너뛰지 않는다)', async () => {
    for (const body of [
      { 118: {} },
      { 118: { summary: { price: 1, amount: 1, buy_price: 1 } } },
      { 118: { '2026-07-16': { price: 1, amount: 1, buy_price: 1 } } },
      { 118: { '2026-07-17': { price: 1, amount: 1 } } },
      { 118: { '2026-07-17': { price: 'N/A', amount: 1, buy_price: 1 } } },
      { 118: { '2026-07-17': { price: 1, amount: 1, buy_price: 1 }, '2026-02-30': { price: 1, amount: 1, buy_price: 1 } } },
    ]) {
      await expect(load({ body }).handler(RANGE)).resolves.toMatchObject({ status: 'unexpected_response' });
    }
  });

  it('로그인 화면·HTML 응답은 login_required, HTTP 오류는 http_error', async () => {
    await expect(load({ pathname: '/login.html' }).handler(RANGE)).resolves.toEqual({ status: 'login_required' });
    await expect(load({ text: '<!DOCTYPE html><html><form>' }).handler(RANGE)).resolves.toEqual({ status: 'login_required' });
    await expect(load({ status: 500, body: {} }).handler(RANGE)).resolves.toEqual({ status: 'http_error', httpStatus: 500 });
  });
});
