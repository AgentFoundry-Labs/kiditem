import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fakeTabPages } from '../tab-page.fake';
import { createSellpiaSite } from './index';
import { SELLPIA_SALES_URL } from './sales';

const RANGE = { startDate: '2026-07-17', endDate: '2026-07-18' };
const ROW = { sellerId: '118', sellerName: '스마트스토어', date: '2026-07-17', price: 1_200, amount: 2, buyPrice: 700 };

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/sellpia sales', () => {
  it('새 백그라운드 탭에서 판매현황 화면을 열고 페이지 호출로 기간을 읽은 뒤 탭을 닫는다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected ? { ok: true, value: { status: 'ok', rows: [ROW], sellers: 1 } } : { ok: false, error: 'content_script_missing' };
      },
    });
    await expect(createSellpiaSite(fake.tabs).sales(RANGE)).resolves.toEqual({ rows: [ROW], sellers: 1 });
    expect(asked[0]).toEqual({ type: 'KIDITEM_PAGE_CALL', call: 'sellpia.sales', args: RANGE });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${SELLPIA_SALES_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/page-call/runner.js,content/orders/sellpia-sales.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('로그인이 풀렸으면 SITE_LOGIN_REQUIRED이고 탭은 운영자에게 남긴다', async () => {
    const expired = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'login_required' } }) });
    expect((await failure(createSellpiaSite(expired.tabs).sales(RANGE))).code).toBe('SITE_LOGIN_REQUIRED');
    expect(expired.log).not.toContain('close 7');
  });

  it('HTTP 오류·형식 틀림은 SITE_REQUEST_FAILED(사유 담아)이고 탭을 닫는다', async () => {
    const http = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'http_error', httpStatus: 502 } }) });
    expect(await failure(createSellpiaSite(http.tabs).sales(RANGE))).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { status: 502, reason: 'http' } });
    expect(http.log.at(-1)).toBe('close 7');
    const odd = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'unexpected_response', reason: 'unknown_seller' } }) });
    expect(await failure(createSellpiaSite(odd.tabs).sales(RANGE))).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'not_json', detail: 'unknown_seller' } });
  });
});
